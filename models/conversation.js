const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
	senderRole: {
		type: String,
		enum: ['rider', 'provider'],
		required: true
	},
	sender: {
		type: mongoose.Schema.Types.ObjectId,
		required: true
	},
	senderName: {
		type: String,
		required: true
	},
	content: {
		type: String,
		required: true,
		trim: true
	},
	createdAt: {
		type: Date,
		default: Date.now
	}
}, {_id: true});

const schema = new mongoose.Schema({
	property: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Property',
		required: true
	},
	rider: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Rider',
		required: true
	},
	provider: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Provider',
		required: true
	},
	messages: [messageSchema],
	lastMessageAt: {
		type: Date,
		default: Date.now
	},
	unreadForRider: {
		type: Number,
		default: 0
	},
	unreadForProvider: {
		type: Number,
		default: 0
	}
}, {timestamps: true});

schema.index({property: 1, rider: 1, provider: 1}, {unique: true});

const model = mongoose.model('Conversation', schema);
module.exports = model;
