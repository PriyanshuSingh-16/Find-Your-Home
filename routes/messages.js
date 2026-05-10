const express = require('express');
const router = express.Router();
const conversations = require('../models/conversation');
const properties = require('../models/property');
const riders = require('../models/rider');
const providers = require('../models/provider');
const {isLoggedIn, isRoleRider} = require('../middlewares/role_validator');
const {validateConversationMessage} = require('../middlewares/schema_validator');

router.use(isLoggedIn);

function isMessagingUser(req, res, next) {
	if (req.user.role === 'rider' || req.user.role === 'provider')
		return next();

	return res.status(403).render('error', {code: 403, error: 'Messaging is only available for riders and providers.'});
}

async function loadInboxConversations(req) {
	const match = req.user.role === 'rider'
		? {rider: req.session.userRoleID}
		: {provider: req.session.userRoleID};

	return conversations.find(match)
		.populate('property')
		.populate('rider')
		.populate('provider')
		.sort({lastMessageAt: -1});
}

async function loadConversationForCurrentUser(conversationID, req) {
	const conversation = await conversations.findById(conversationID)
		.populate('property')
		.populate('rider')
		.populate('provider');

	if (!conversation)
		return null;

	if (req.user.role === 'rider' && !conversation.rider._id.equals(req.session.userRoleID))
		return null;

	if (req.user.role === 'provider' && !conversation.provider._id.equals(req.session.userRoleID))
		return null;

	return conversation;
}

async function renderInbox(req, res, activeConversation, pageTitle = 'Your inbox') {
	const inboxConversations = await loadInboxConversations(req);

	if (activeConversation) {
		activeConversation = inboxConversations.find(conversation => conversation._id.equals(activeConversation._id))
			|| activeConversation;
	}

	res.render('messages-inbox', {
		pageTitle,
		inboxConversations,
		activeConversation,
		isProvider: req.user.role === 'provider',
	});
}

async function markConversationAsRead(conversation, req) {
	if (!conversation)
		return;

	if (req.user.role === 'rider' && conversation.unreadForRider > 0) {
		conversation.unreadForRider = 0;
		await conversation.save();
	}

	if (req.user.role === 'provider' && conversation.unreadForProvider > 0) {
		conversation.unreadForProvider = 0;
		await conversation.save();
	}
}

async function findOrCreateConversation(propertyID, riderID) {
	const property = await properties.findById(propertyID).populate('owner');
	if (!property)
		throw new Error('Property not found!');

	const rider = await riders.findById(riderID);
	if (!rider)
		throw new Error('Rider not found!');

	let conversation = await conversations.findOne({
		property: property._id,
		rider: rider._id,
		provider: property.owner._id
	});

	if (!conversation) {
		conversation = await conversations.create({
			property: property._id,
			rider: rider._id,
			provider: property.owner._id,
			messages: []
		});
	}

	return {
		property,
		rider,
		conversation
	};
}

router.get('/', isMessagingUser, async (req, res) => {
	try {
		const inboxConversations = await loadInboxConversations(req);
		const activeConversation = inboxConversations[0] || null;

		await markConversationAsRead(activeConversation, req);

		res.render('messages-inbox', {
			pageTitle: 'Your inbox',
			inboxConversations,
			activeConversation,
			isProvider: req.user.role === 'provider',
		});
	} catch (e) {
		console.log(e);
		res.status(500).render('error', {code: 500, error: 'Internal server error'});
	}
});

router.get('/property/:propertyID', isRoleRider, async (req, res) => {
	try {
		const {propertyID} = req.params;
		const {conversation} = await findOrCreateConversation(propertyID, req.session.userRoleID);
		const activeConversation = await loadConversationForCurrentUser(conversation._id, req);

		await markConversationAsRead(activeConversation, req);
		await renderInbox(req, res, activeConversation, 'Contact property owner');
	} catch (e) {
		console.log(e);
		res.status(500).render('error', {code: 500, error: e.message || 'Internal server error'});
	}
});

router.get('/:id', isMessagingUser, async (req, res) => {
	try {
		const activeConversation = await loadConversationForCurrentUser(req.params.id, req);

		if (!activeConversation)
			return res.status(404).render('error', {code: 404, error: 'Conversation not found!'});

		await markConversationAsRead(activeConversation, req);
		await renderInbox(req, res, activeConversation, 'Conversation');
	} catch (e) {
		console.log(e);
		res.status(500).render('error', {code: 500, error: 'Internal server error'});
	}
});

router.post('/property/:propertyID', isRoleRider, validateConversationMessage, async (req, res) => {
	try {
		const {propertyID} = req.params;
		const {content} = req.body;
		const {rider, conversation} = await findOrCreateConversation(propertyID, req.session.userRoleID);

		conversation.messages.push({
			senderRole: 'rider',
			sender: rider._id,
			senderName: rider.name,
			content: content.trim()
		});
		conversation.lastMessageAt = new Date();
		conversation.unreadForProvider += 1;
		await conversation.save();

		res.redirect(`/messages/${conversation._id}`);
	} catch (e) {
		console.log(e);
		res.status(500).render('error', {code: 500, error: e.message || 'Internal server error'});
	}
});

router.post('/:id', isMessagingUser, validateConversationMessage, async (req, res) => {
	try {
		const conversation = await loadConversationForCurrentUser(req.params.id, req);
		if (!conversation)
			return res.status(404).render('error', {code: 404, error: 'Conversation not found!'});

		const sender = req.user.role === 'rider'
			? await riders.findById(req.session.userRoleID)
			: await providers.findById(req.session.userRoleID);

		if (!sender)
			return res.status(404).render('error', {code: 404, error: 'User not found!'});

		conversation.messages.push({
			senderRole: req.user.role,
			sender: sender._id,
			senderName: sender.name,
			content: req.body.content.trim()
		});
		conversation.lastMessageAt = new Date();

		if (req.user.role === 'rider')
			conversation.unreadForProvider += 1;
		else
			conversation.unreadForRider += 1;

		await conversation.save();
		res.redirect(`/messages/${conversation._id}`);
	} catch (e) {
		console.log(e);
		res.status(500).render('error', {code: 500, error: e.message || 'Internal server error'});
	}
});

module.exports = router;
