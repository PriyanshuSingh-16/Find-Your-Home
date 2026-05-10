const express = require('express');
const {
	isLoggedIn,
	isRoleAdmin,
	isRoleProvider,
	isRoleRider,
	isRoleAdminOrProvider
} = require('../middlewares/role_validator');
const bookings = require('../models/booking');
const providers = require('../models/provider');
const properties = require('../models/property');
const riders = require('../models/rider');
const keys = require('../models/key');
const {
	sendBookingSuccessEmail,
	sendBookingFailEmail,
	sendBookingFinalSuccessEmail,
	sendBookingFinalFailEmail,
	sendBookingOtpEmail,
	sendBookingCancellationEmailForRider,
	sendBookingCancellationEmailForProvider
} = require('../utils/mail_sender');
const {bookingOtpGenerator} = require('../utils/key_generator');

const router = express.Router();
const OTP_EXPIRY_MS = 10 * 60 * 1000;

function normalizeDateInput(value) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime()))
		return null;

	date.setHours(0, 0, 0, 0);
	return date;
}

function formatDate(date) {
	return date.toLocaleDateString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	});
}

function isBookingCancellable(booking) {
	if (!booking || booking.cancelledAt || booking.checkedOutAt || !booking.res)
		return false;

	const today = normalizeDateInput(new Date());
	const moveInDate = normalizeDateInput(booking.checkInDate);

	if (!moveInDate)
		return false;

	return moveInDate >= today;
}

function validateBookingRequest({checkInDate, roomsBooked}) {
	const checkIn = normalizeDateInput(checkInDate);
	const rooms = Number(roomsBooked);
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	if (!checkIn)
		return {error: 'Please provide a valid move-in date.'};

	if (checkIn < today)
		return {error: 'Move-in date can not be in the past.'};

	if (!Number.isInteger(rooms) || rooms < 1)
		return {error: 'Please choose at least 1 room.'};

	return {checkIn, rooms};
}

async function getReservedRooms(propertyID, moveInDate) {
	const overlappingBookings = await bookings.find({
		property: propertyID,
		checkInDate: {$lte: moveInDate},
		$or: [
			{completed: false},
			{res: true}
		],
		$and: [
			{
				$or: [
					{checkedOutAt: {$exists: false}},
					{checkedOutAt: null},
					{checkedOutAt: {$gt: moveInDate}}
				]
			}
		]
	});

	return overlappingBookings.reduce((sum, booking) => sum + (booking.roomsBooked || 0), 0);
}

async function getAvailability(property, moveInDate) {
	const reservedRooms = await getReservedRooms(property._id, moveInDate);
	const totalRooms = property.availableRooms || property.maxOcc || 0;

	return {
		totalRooms,
		reservedRooms,
		availableRooms: Math.max(totalRooms - reservedRooms, 0)
	};
}

async function createBookingRecord({
	propertyID,
	riderID,
	checkInDate,
	roomsBooked,
	paymentID
}) {
	const property = await properties.findById({_id: propertyID});
	if (!property)
		throw new Error('Property not found!');

	const owner = await providers.findById(property.owner);
	const rider = await riders.findById({_id: riderID});

	if (!owner || !rider)
		throw new Error('Booking participants not found!');

	const createdBooking = await bookings.create({
		by: rider,
		owner: owner,
		property: property,
		date: Date.now(),
		checkInDate,
		roomsBooked,
		paymentID,
		isTransferred: false,
		completed: true,
		res: true,
		status: 'confirmed',
	});

	rider.bookings.push(createdBooking);
	await rider.save();

	owner.bookingCompleted.push(createdBooking);
	await owner.save();

	return createdBooking;
}

router.get('/', isLoggedIn, isRoleAdmin, async (req, res) => {
	try {
		let {skip} = req.query;
		skip = Number(skip) || 0;

		if (skip < 0) {
			req.query.skip = 0;
			skip = 0;
		}

		const results = await bookings.find({})
			.populate({path: 'by'})
			.populate({path: 'property'})
			.skip(skip)
			.limit(10);

		return res.render('admin-details', {
			type: 'booking',
			results,
			query: req.query,
			isFirst: skip === 0,
			isLast: results.length < 10,
		});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'});
	}
});

router.get('/:propertyID/new', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {propertyID} = req.params;
		const property = await properties.findById({_id: propertyID}).populate('owner');

		if (!property)
			return res.status(404).render('error', {code: 404, error: 'Property not found!'});

		res.render('booking-details', {property});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'});
	}
});

router.post('/:propertyID/send-otp', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {propertyID} = req.params;
		const property = await properties.findById({_id: propertyID});

		if (!property)
			return res.status(404).send({error: 'Property not found!'});

		const parsed = validateBookingRequest(req.body);
		if (parsed.error)
			return res.status(406).send({error: parsed.error});

		const {checkIn, rooms} = parsed;
		const availability = await getAvailability(property, checkIn);

		if (rooms > availability.availableRooms) {
			return res.status(406).send({
				error: `Only ${availability.availableRooms} room(s) are available from the selected move-in date onward.`
			});
		}

		await keys.deleteMany({
			purpose: 'booking-otp',
			'content.user': req.session.userRoleID.toString(),
			'content.propertyID': property._id.toString()
		});

		const otp = bookingOtpGenerator();
		const otpKey = await keys.create({
			key: bookingOtpGenerator() + Date.now().toString(),
			purpose: 'booking-otp',
			content: {
				user: req.session.userRoleID.toString(),
				propertyID: property._id.toString(),
				checkInDate: checkIn.toISOString(),
				roomsBooked: rooms,
				otp
			}
		});

		await sendBookingOtpEmail(req.user.username, {
			otp,
			propertyName: property.name,
			moveInDate: formatDate(checkIn),
			roomsBooked: rooms
		});

		res.send({
			success: 'Verification code sent successfully.',
			otpKey: otpKey.key,
			availability
		});
	} catch (e) {
		console.log(e);
		res.status(500).send({error: e.message || 'Could not send booking verification OTP.'});
	}
});

router.post('/:propertyID/verify-and-pay', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {propertyID} = req.params;
		const {otpKey, otp} = req.body;
		const property = await properties.findById({_id: propertyID});

		if (!property)
			return res.status(404).send({error: 'Property not found!'});

		const otpRecord = await keys.findOne({key: otpKey, purpose: 'booking-otp'});
		if (!otpRecord)
			return res.status(404).send({error: 'Booking verification request not found. Please request OTP again.'});

		if (Date.now() - new Date(otpRecord.createdAt).getTime() > OTP_EXPIRY_MS) {
			await keys.deleteOne({_id: otpRecord._id});
			return res.status(410).send({error: 'OTP expired. Please request a new one.'});
		}

		if (
			otpRecord.content.user !== req.session.userRoleID.toString() ||
			otpRecord.content.propertyID !== propertyID
		) {
			return res.status(403).send({error: 'This booking verification request does not belong to you.'});
		}

		if (String(otp || '').trim() !== String(otpRecord.content.otp))
			return res.status(401).send({error: 'Incorrect OTP. Please try again.'});

		const checkIn = new Date(otpRecord.content.checkInDate);
		const roomsBooked = Number(otpRecord.content.roomsBooked);
		const availability = await getAvailability(property, checkIn);

		if (roomsBooked > availability.availableRooms)
			return res.status(406).send({error: `Only ${availability.availableRooms} room(s) remain available from that move-in date.`});

		otpRecord.content.verified = true;
		otpRecord.content.verifiedAt = new Date().toISOString();
		otpRecord.markModified('content');
		await otpRecord.save();

		res.send({
			success: true,
			bookingData: {
				checkInDate: otpRecord.content.checkInDate,
				roomsBooked,
				verificationKey: otpRecord.key
			}
		});
	} catch (e) {
		console.log(e);
		res.status(500).send({error: e.message || 'Could not verify booking details.'});
	}
});

router.get('/payment-successful', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {propertyID, key} = req.query;
		const keyGiven = await keys.findOne({key});

		if (!keyGiven)
			return res.render('error', {code: '404', error: 'Invalid booking attempt'});

		if (keyGiven.purpose !== 'payment')
			return res.render('error', {code: '406', error: 'Invalid booking attempt'});

		const property = await properties.findById({_id: propertyID});
		if (!property)
			return res.render('error', {code: '404', error: 'Property not found'});

		if (
			keyGiven.content.user !== req.session.userRoleID.toString() ||
			keyGiven.content.prop !== propertyID
		) {
			return res.render('error', {code: '403', error: 'Unauthorized booking attempt'});
		}

		const checkInDate = new Date(keyGiven.content.checkInDate);
		const roomsBooked = Number(keyGiven.content.roomsBooked);
		const availability = await getAvailability(property, checkInDate);

		if (roomsBooked > availability.availableRooms) {
			await sendBookingFailEmail(req.user.username, {
				amountPaid: property.bookingMoney,
				customerName: req.session.userDet.name,
				propertyID,
				paymentID: keyGiven.content.paymentID,
				date: keyGiven.createdAt
			});
			await keys.findOneAndDelete({key});
			return res.render('error', {
				code: '406',
				error: 'Selected rooms are no longer available from that move-in date. Please try again with different details.'
			});
		}

		const createdBooking = await createBookingRecord({
			propertyID,
			riderID: req.session.userRoleID,
			checkInDate,
			roomsBooked,
			paymentID: keyGiven.content.paymentID
		});

		await sendBookingSuccessEmail(req.user.username, {
			bookingID: createdBooking.id,
			customerName: req.session.userDet.name,
			bookingDate: keyGiven.createdAt,
			amountPaid: property.bookingMoney
		});

		await keys.findOneAndDelete({key});
		res.render('success', {
			success: `Your booking is confirmed for ${roomsBooked} room(s) with move-in from ${formatDate(checkInDate)}. Details have been mailed to you!`
		});
	} catch (e) {
		console.log(e);
		res.render('error', {code: 500, error: 'Internal server error'});
	}
});

router.post('/', async (req, res) => {
	try {
		const {propertyID, userID: riderID, checkInDate, roomsBooked, paymentID} = req.query;
		const createdBooking = await createBookingRecord({
			propertyID,
			riderID,
			checkInDate: new Date(checkInDate),
			roomsBooked: Number(roomsBooked),
			paymentID
		});

		res.send({bookingID: createdBooking.id});
	} catch (e) {
		res.status(500).send({error: 'internal server error!'});
	}
});

router.patch('/:id', isLoggedIn, isRoleProvider, async (req, res) => {
	try {
		const {id: bookingID} = req.params;
		const booking = await bookings.findById({_id: bookingID});

		if (!booking)
			return res.status(404).send({error: 'Booking not found!'});

		const providerID = req.session.userRoleID;
		if (!booking.owner.equals(providerID))
			return res.status(406).send({error: 'Request denied!'});

		return res.status(410).send({error: 'Provider approval is no longer required. Paid bookings are confirmed automatically.'});
	} catch (e) {
		res.render('error', {code: 500, error: 'Internal server error'});
	}
});

router.get('/:id/cancel', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {id: bookingID} = req.params;
		const booking = await bookings.findById({_id: bookingID})
			.populate('property')
			.populate('owner');

		if (!booking)
			return res.status(404).render('error', {code: 404, error: 'Booking not found!'});

		if (!booking.by.equals(req.session.userRoleID))
			return res.status(403).render('error', {code: 403, error: 'Not authorized to cancel this booking.'});

		if (!isBookingCancellable(booking))
			return res.status(406).render('error', {code: 406, error: 'This booking can no longer be cancelled from the dashboard.'});

		res.render('booking-cancel', {booking, formatDate});
	} catch (e) {
		console.log(e);
		res.status(500).render('error', {code: 500, error: 'Internal server error'});
	}
});

router.post('/:id/cancel', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {id: bookingID} = req.params;
		const reason = String(req.body.reason || '').trim();
		const booking = await bookings.findById({_id: bookingID}).populate('property').populate('by').populate('owner');

		if (!booking)
			return res.status(404).send({error: 'Booking not found!'});

		if (!booking.by.equals(req.session.userRoleID))
			return res.status(403).send({error: 'Not authorized to cancel this booking.'});

		if (!isBookingCancellable(booking))
			return res.status(406).send({error: 'This booking can no longer be cancelled from the dashboard.'});

		if (reason.length < 10)
			return res.status(406).send({error: 'Please provide a cancellation reason with at least 10 characters.'});

		booking.cancelledAt = new Date();
		booking.cancellationReason = reason;
		booking.status = 'cancelled';
		booking.checkedOutAt = booking.cancelledAt;
		await booking.save();

		// Send cancellation emails to rider and provider
		try {
			const riderEmailContent = {
				riderName: booking.by.name,
				propName: booking.property.name,
				bookingID: booking._id.toString(),
				cancellationDate: booking.cancelledAt,
				cancellationReason: reason
			};
			await sendBookingCancellationEmailForRider(booking.by.email, riderEmailContent);

			const providerEmailContent = {
				providerName: booking.owner.name,
				propName: booking.property.name,
				riderName: booking.by.name,
				bookingID: booking._id.toString(),
				cancellationDate: booking.cancelledAt,
				cancellationReason: reason
			};
			await sendBookingCancellationEmailForProvider(booking.owner.email, providerEmailContent);
		} catch (emailError) {
			console.log('Email sending failed:', emailError);
			// Don't fail the booking cancellation if email fails
		}

		res.send({
			success: `Booking for ${booking.property?.name || 'this property'} was cancelled. The booking amount will not be refunded.`
		});
	} catch (e) {
		console.log(e);
		res.status(500).send({error: 'Could not cancel booking!'});
	}
});

router.post('/:id/checkout', isLoggedIn, isRoleRider, async (req, res) => {
	try {
		const {id: bookingID} = req.params;
		const booking = await bookings.findById({_id: bookingID}).populate('property');

		if (!booking)
			return res.status(404).send({error: 'Booking not found!'});

		if (!booking.by.equals(req.session.userRoleID))
			return res.status(403).send({error: 'Not authorized to check out this booking.'});

		if (!booking.res)
			return res.status(406).send({error: 'Only approved bookings can be checked out.'});

		if (booking.checkedOutAt)
			return res.status(406).send({error: 'This booking has already been checked out.'});

		if (booking.checkInDate && normalizeDateInput(booking.checkInDate) > normalizeDateInput(new Date()))
			return res.status(406).send({error: 'Checkout is only available after the move-in date has started.'});

		booking.checkedOutAt = new Date();
		booking.status = 'checked_out';
		await booking.save();

		res.send({
			success: `Checked out successfully from ${booking.property?.name || 'this property'}. Room inventory is now available for new bookings.`
		});
	} catch (e) {
		console.log(e);
		res.status(500).send({error: 'Could not complete checkout!'});
	}
});

router.delete('/:id', isLoggedIn, isRoleAdminOrProvider, async (req, res) => {
	try {
		const {id: bookingID} = req.params;
		const booking = await bookings.findById({_id: bookingID});

		if (!booking)
			return res.status(404).send({error: 'Booking not found!'});

		const providerID = req.session.userRoleID;
		if (req.user.role !== 'admin' && !booking.owner.equals(providerID))
			return res.status(406).send({error: 'Request denied!'});

		await riders.updateOne({_id: booking.by}, {$pull: {bookings: booking._id}});
		await providers.updateOne(
			{_id: booking.owner},
			{$pull: {bookingPending: booking._id, bookingCompleted: booking._id}}
		);

		await bookings.findByIdAndDelete(booking._id);
		res.send({success: 'booking deleted successfully'});
	} catch (e) {
		console.log(e);
		res.send({error: 'Could not delete booking!'});
	}
});

module.exports = router;
