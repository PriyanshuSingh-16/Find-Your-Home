const express = require('express');
const {isLoggedIn, isRoleProvider, isRoleAdminOrProvider, isRoleRider, isRoleAdmin} = require("../middlewares/role_validator");
const {validatePropertyDetails} = require('../middlewares/schema_validator');
const router = express.Router();
const providers = require('../models/provider');
const properties = require('../models/property');
const riders = require('../models/rider');
const keys = require('../models/key');
const {uploadPropertyImages} = require("../middlewares/file_uploader");
const {uploadPropertyVideos} = require("../middlewares/file_uploader");
const {uploadPropertyMedia} = require("../middlewares/file_uploader");
const {convertToArray} = require("../utils/some_methods");
const {paymentKeyGenerator} = require('../utils/key_generator');
const {stripePrivateKey, serverURL} = require('../config');
const bookings = require("../models/booking");
const stripe = require('stripe')(stripePrivateKey);
const fs = require('fs');
const path = require('path');

router.get('/all', isLoggedIn, isRoleAdmin, async (req, res) => {
	try {
		let {skip} = req.query;

		if (!skip || skip <= 0) {
			req.query.skip = 0;
			skip = 0;
		}

		const results = await properties.find({}).skip(skip).limit(10);

		return res.render('admin-details', {
			type: 'property',
			results,
			query: req.query,
			isFirst: skip === 0,
			isLast: results.length < 10,
		});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}}
)

router.get('/search', async (req, res) => {
	try {
		const topProperty = JSON.parse(
			fs.readFileSync(
				path.join(__dirname, '../data/top_property.json'),
				"utf-8")
		) || [];

		res.render('search-home', {topProperty});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}
})

router.get('/', async (req, res) => {
	try {
		let {
			searchType, // determining what type of search it is. values: ['zip', 'text']
			searchText, // text entered for searching
			gender, // what gender are we looking for
			rating, // what is the minimum rating
			rate, // what is the maximum rate
			skip, // how many results to skip
			resCount // how many results to return
		} = req.query;

		if (!searchType || !searchText)
			return res.render('error', {error: 'Invalid search input', code: 403});

		let filter = {};

		if (gender) filter.type = gender;
		if (rating) filter.rating = { $gte: rating };
		if (rate) filter.rate = { $lte: Number(rate) };
		if (searchType === 'zip')
			filter['address.zipcode'] = searchText;
		else
			filter['$text'] = {$search: searchText};

		if (!resCount) {
			req.query.resCount = 10;
			resCount = 10;
		}

		let isFirst = false;
		if (!skip || Number(skip) === 0 || skip < 0) {
			req.query.skip = 0;
			skip = 0;
			isFirst = true;
		}

		let result;
		if (searchType === 'zip')
			result = await properties.find(filter).sort({name: 1}).skip(skip).limit(resCount);
		else
			result = await properties.find(filter, {
				score: {$meta: "textScore"}
			}).sort({score:{$meta:"textScore"}, name: 1}).skip(skip).limit(resCount);


		let isLast = false;
		if (result.length < resCount)
			isLast = true;

		return res.render('search-result',{
			results: result,
			isFirst: isFirst,
			isLast: isLast,
			query: req.query,
		});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}
})

router.get('/new', isLoggedIn, isRoleProvider, (req, res) => {
	try {
		res.render('register-pg');
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}
});

router.post('/',
	isLoggedIn,
	isRoleProvider,
	uploadPropertyMedia.fields([
		{ name: 'property-image', maxCount: 20 },
		{ name: 'property-videos', maxCount: 5 }
	]),
	validatePropertyDetails,
	async (req, res) => {
	try {
		let {
			name, addBuilding, addL1, addL2, exactLocationLink, landmark, state, city, zipCode, maxOccupancy, type, desc, food, foodText,
			amenities, rules, otherCharges, otherChargesText, occupancy, rate, tagLine, since, bookingMoney, availableRooms
		} = req.body;
		const address = { building: addBuilding, addL1, addL2, landmark, state, city, zipcode: zipCode, country: 'India' };

		const foodProp = [];
		food = convertToArray(food);
		foodText = convertToArray(foodText);
		food.forEach((v, idx) => {
			foodProp.push({ name: v, detail: foodText[idx], path: `images/svg/${v}`});
		});

		const amenityProp = [];
		amenities = convertToArray(amenities);
		amenities.forEach((v, idx) => {
			amenityProp.push({ name: v, path: `images/svg/${v}`});
		});

		const allRules = ['visitor', 'non-veg-food', 'other-gender', 'smoking', 'drinking', 'loud-music', 'party'];
		const rulesProp = [];
		rules = convertToArray(rules);
		allRules.forEach((v) => {
			rulesProp.push({ name: v, allowed: rules.includes(v), path: `images/svg/${v}`});
		});

		const otherChargesProp = [];
		otherCharges = convertToArray(otherCharges);
		otherChargesText = convertToArray(otherChargesText);
		otherCharges.forEach((v, idx) => {
			otherChargesProp.push({name: v, detail: otherChargesText[idx], path: `images/svg/${v}`})
		});

		const userRoleID = req.session.userRoleID;
		const owner = await providers.findById({_id: userRoleID});
		if (!owner)
			return res.status(404).send({error: 'Provider not found!'});

		occupancy = convertToArray(occupancy);

		// Extract image and video files from fields
		const images = ((req.files && req.files['property-image']) || [])
			.map(v => v.path);
		
		const videos = ((req.files && req.files['property-videos']) || [])
			.map(v => v.path);

		const propertyCreated = await properties.create({
			name, address: address, maxOcc: maxOccupancy, type, desc, food: foodProp, amenities: amenityProp, rules: rulesProp,
			otherCharges: otherChargesProp, occupancy, rate, tagline: tagLine, since, interested: 0, rating: 0.0, owner: owner, bookingMoney,
			availableRooms,
			images, videos, exactLocationLink
		});

		owner.properties.push(propertyCreated.id);
		owner.save();

		return res.send({
			success: 'Property Created Successfully',
			propertyCreated
		});
	} catch (e) {
		console.error('Property creation error:', {
			message: e.message,
			stack: e.stack,
			files: req.files ? Object.keys(req.files) : 'no files'
		});
		res.status(500).send({error: e.message || 'Internal server error'});
	}
});

router.get('/:id', async (req, res) => {
	try {
		const {id} = req.params;
		const property = await properties.findById({_id: id});

		if (!property)
			return res.status(404).render('error', {error: 'Property not found!', code: 404});

		await property.populate({
			path: 'reviews',
			populate: {
				path: 'userID'
			},
			options: {
				sort: {date: -1}
			}
		});

		await property.populate('owner');
		res.render('property-page', {property});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}
})

router.get('/:id/edit', isLoggedIn, isRoleProvider, async (req, res) => {
	try {
		const {id} = req.params;
		const property = await properties.findById({_id: id});

		if (!property.owner.equals(req.session.userRoleID))
			return res.status(403).send({error: 'Not Authorized!'});

		res.render('edit-pg',{property});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}
})

router.patch('/:id',
	isLoggedIn,
	isRoleProvider,
	uploadPropertyMedia.fields([
		{ name: 'property-image', maxCount: 20 },
		{ name: 'property-videos', maxCount: 5 }
	]),
	validatePropertyDetails,
	async (req, res) => {
	try {
		const {id} = req.params;
		const property = await properties.findById({_id: id});

		if (!property.owner.equals(req.session.userRoleID))
			return res.status(403).send({error: 'Not Authorized!'});

		let {
			name, addBuilding, addL1, addL2, exactLocationLink, landmark, state, city, zipCode,
			maxOccupancy, type, desc, food, foodText,
			amenities, rules, otherCharges, otherChargesText, occupancy, rate, tagLine, since, bookingMoney, availableRooms
		} = req.body;

		property.name = name;
		property.address = {
			building: addBuilding,
			addL1,
			addL2,
			landmark,
			city,
			state,
			zipcode: zipCode,
			country: 'India'
		};
		property.exactLocationLink = exactLocationLink;

		property.food = [];
		food = convertToArray(food);
		foodText = convertToArray(foodText);
		food.forEach((v, idx) => {
			property.food.push({name: v, detail: foodText[idx], path: `images/svg/${v}`});
		});

		property.amenities = [];
		amenities = convertToArray(amenities);
		amenities.forEach((v, idx) => {
			property.amenities.push({name: v, path: `images/svg/${v}`});
		});

		const allRules = ['visitor', 'non-veg-food', 'other-gender', 'smoking', 'drinking', 'loud-music', 'party'];
		property.rules = [];
		rules = convertToArray(rules);
		allRules.forEach((v) => {
			property.rules.push({name: v, allowed: rules.includes(v), path: `images/svg/${v}`});
		});

		property.otherCharges = [];
		otherCharges = convertToArray(otherCharges);
		otherChargesText = convertToArray(otherChargesText);
		otherCharges.forEach((v, idx) => {
			property.otherCharges.push({name: v, detail: otherChargesText[idx], path: `images/svg/${v}`})
		});

		occupancy = convertToArray(occupancy);

		property.maxOcc = maxOccupancy;
		property.availableRooms = availableRooms;
		property.type = type;
		property.desc = desc;
		property.occupancy = occupancy;
		property.rate = rate;
		property.tagline = tagLine;
		property.since = since;
		property.bookingMoney = bookingMoney;

		if (req.files && (req.files['property-image'] || req.files['property-videos'])) {
			const imageFiles = req.files['property-image'] || [];
			const videoFiles = req.files['property-videos'] || [];
			
			if (imageFiles.length > 0)
				property.images = imageFiles.map((file) => file.path);
			
			if (videoFiles.length > 0)
				property.videos = videoFiles.map((file) => file.path);
		}

		await property.save();

		res.send({success: 'property edited successfully'});
	} catch (e) {
		console.error('Property edit error:', {
			message: e.message,
			stack: e.stack,
			files: req.files ? Object.keys(req.files) : 'no files'
		});
		res.status(500).send({error: e.message || 'Internal server error'});
	}
});

router.delete('/:id', isLoggedIn, isRoleAdminOrProvider, async (req, res) => {
	try {
		const {id} = req.params;
		const property = await properties.findById({_id: id});

		if (req.user.role !== 'admin' && !property.owner.equals(req.session.userRoleID))
			return res.status(403).send({error: 'Not Authorized!'});

		const owner = await providers.findById({_id: property.owner});
		await owner.populate('bookingPending');
		owner.bookingPending = owner.bookingPending.filter(book => !book.property.equals(id));
		owner.save();

		await bookings.deleteMany({$and: [{property: id}, {completed: false}]});
		await riders.updateMany({}, {$pull: {bookings: {$and: [{property: id}, {completed: false}]}}});

		await providers.updateOne({_id: property.owner}, {$pull: {properties: property.id}});
		await properties.deleteOne({_id: id});

		return res.send({success: 'property deleted successfully'});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}
})

router.post('/:id/toggle', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const userId = req.session.userRoleID;
		const user = await riders.findById({_id: userId});

		const {id} = req.params;
		const property = await properties.findById({_id: id});

		let state;
		if (user.likes.includes(id)) {
			property.interested -= 1;
			await riders.findOneAndUpdate({_id: userId}, {$pull: {likes: property.id}});
			state = false; // does not exist in likes of user now.
		} else {
			property.interested += 1;
			await riders.findOneAndUpdate({_id: userId}, {$push: {likes: property.id}});
			state = true; // does exist in likes of user now.
		}

		await property.save();
		res.send({success: 'updated successfully', state});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'})
	}
});

router.get('/:id/makePayment', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {id} = req.params;
		const {checkInDate, roomsBooked, verificationKey} = req.query;
		const property = await properties.findById({_id: id});

		if (!stripePrivateKey)
			return res.status(500).send({error: 'Stripe is not configured. Add STRIPE_PRIVATE_KEY in secret.env.'});

		if (!checkInDate || !roomsBooked || !verificationKey)
			return res.status(406).send({error: 'Booking details are incomplete. Please verify them again.'});

		const verificationRequest = await keys.findOne({key: verificationKey, purpose: 'booking-otp'});
		if (!verificationRequest)
			return res.status(404).send({error: 'Booking verification request not found. Please verify booking details again.'});

		if (
			verificationRequest.content.user !== req.session.userRoleID.toString() ||
			verificationRequest.content.propertyID !== property._id.toString() ||
			verificationRequest.content.checkInDate !== checkInDate ||
			Number(verificationRequest.content.roomsBooked) !== Number(roomsBooked) ||
			!verificationRequest.content.verified
		) {
			return res.status(403).send({error: 'Booking verification is invalid. Please verify details again.'});
		}

		const paymentKey = paymentKeyGenerator();
		const paymentSession = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: [{
				price_data: {
					currency: 'inr',
					product_data: {
						name: property.name
					},
					unit_amount: property.bookingMoney*100
				},
				quantity: 1
			}],
			mode: 'payment',
			success_url: `${serverURL}/booking/payment-successful?propertyID=${id}&key=${paymentKey}`,
			cancel_url: `${serverURL}/booking/${id}/new`
		});

		res.json({url: paymentSession.url});

		await keys.create({
			key: paymentKey,
			content: {
				user: req.session.userRoleID.toString(),
				prop: property._id.toString(),
				paymentID: paymentSession.id,
				checkInDate,
				roomsBooked,
			},
			purpose: 'payment'
		});
		await keys.deleteOne({_id: verificationRequest._id});
	} catch (e) {
		console.log(e);
		res.status(500).send({error: e.message || 'Internal server error'});
	}
});

module.exports = router;
