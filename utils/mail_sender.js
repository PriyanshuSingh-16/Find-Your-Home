const {emailAdd, appPass, serverURL} = require('../config');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: emailAdd,
		pass: appPass
	}
});

function renderList(items) {
	return items.map(item => `<li style="margin-bottom:8px;">${item}</li>`).join('');
}

function renderKeyValueRows(rows) {
	return rows.map(({label, value}) => (
		'<tr>' +
			`<td style="padding:12px 14px; border-bottom:1px solid #e3edf2; color:#5d7687; font-size:14px; width:42%;">${label}</td>` +
			`<td style="padding:12px 14px; border-bottom:1px solid #e3edf2; color:#163247; font-size:14px; font-weight:700;">${value}</td>` +
		'</tr>'
	)).join('');
}

function createEmailTemplate({
	preheader,
	eyebrow = 'StayVista',
	title,
	intro,
	primaryButtonLabel,
	primaryButtonUrl,
	sections = [],
	closing = [],
	fallbackText,
	fallbackUrl,
	footerNote = 'This is an automated transactional email regarding your account activity and security.'
}) {
	const sectionsHtml = sections.map(section => (
		'<div style="background:#f9fcfd; border:1px solid #dbe8ef; border-radius:18px; padding:18px 20px; margin-bottom:18px;">' +
			`<p style="margin:0 0 12px; color:#163247; font-weight:700; font-size:15px;">${section.title}</p>` +
			(section.html
				? section.html
				: section.paragraph
				? `<p style="margin:0; color:#5e7687; font-size:14px; line-height:1.8;">${section.paragraph}</p>`
				: `<ul style="margin:0; padding-left:18px; color:#5e7687; font-size:14px; line-height:1.8;">${renderList(section.list || [])}</ul>`) +
		'</div>'
	)).join('');

	const closingHtml = closing.map(paragraph => (
		`<p style="margin:0 0 16px; color:#365166; font-size:15px; line-height:1.85;">${paragraph}</p>`
	)).join('');

	const buttonHtml = primaryButtonLabel && primaryButtonUrl
		? (
			'<div style="margin:28px 0; text-align:center;">' +
				`<a href="${primaryButtonUrl}" style="display:inline-block; background:#2d7396; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:999px; font-weight:700; font-size:15px;">${primaryButtonLabel}</a>` +
			'</div>'
		)
		: '';

	const fallbackHtml = fallbackText && fallbackUrl
		? (
			`<p style="margin:0 0 14px; color:#365166; font-size:14px; line-height:1.8;">${fallbackText}</p>` +
			`<p style="margin:0; color:#6b8191; font-size:13px; line-height:1.8;"><a href="${fallbackUrl}" style="color:#2d7396; word-break:break-all;">${fallbackUrl}</a></p>`
		)
		: '';

	return (
		'<!doctype html>' +
		'<html lang="en">' +
		'<head>' +
		'<meta charset="UTF-8">' +
		'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
		`<title>${title}</title>` +
		(preheader ? `<meta name="description" content="${preheader}">` : '') +
		'</head>' +
		'<body style="margin:0; padding:0; background:#eef4f7; font-family:Arial, sans-serif; color:#18374d;">' +
		(preheader
			? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${preheader}</div>`
			: '') +
		'  <div style="max-width:680px; margin:0 auto; padding:32px 18px;">' +
		'    <div style="background:#ffffff; border:1px solid #dbe8ef; border-radius:24px; overflow:hidden; box-shadow:0 18px 40px rgba(31,56,88,0.08);">' +
		'      <div style="padding:32px; background:linear-gradient(145deg, #f8fcfe 0%, #e7f1f6 100%); border-bottom:1px solid #dbe8ef;">' +
		`        <p style="margin:0 0 10px; color:#4c86a8; font-size:12px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase;">${eyebrow}</p>` +
		`        <h1 style="margin:0 0 12px; color:#163247; font-size:32px; line-height:1.15;">${title}</h1>` +
		`        <p style="margin:0; color:#587082; font-size:16px; line-height:1.7;">${intro}</p>` +
		'      </div>' +
		'      <div style="padding:32px;">' +
		closingHtml +
		buttonHtml +
		sectionsHtml +
		fallbackHtml +
		'      </div>' +
		'      <div style="padding:20px 32px 28px; border-top:1px solid #dbe8ef; color:#6b8191; font-size:13px; line-height:1.85;">' +
		'        <strong style="color:#365166;">Team StayVista</strong><br>' +
		'        Secure account support for your stay search and booking experience.<br>' +
		`        ${footerNote}` +
		'      </div>' +
		'    </div>' +
		'  </div>' +
		'</body>' +
		'</html>'
	);
}

function createTableCard(title, rows) {
	return (
		'<div style="background:#f9fcfd; border:1px solid #dbe8ef; border-radius:18px; padding:18px 20px; margin-bottom:18px;">' +
			`<p style="margin:0 0 14px; color:#163247; font-weight:700; font-size:15px;">${title}</p>` +
			'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
				renderKeyValueRows(rows) +
			'</table>' +
		'</div>'
	);
}

function createValidationEmail(validationKey) {
	const url = `${serverURL}/auth/validate?validationKey=${validationKey}`;

	return createEmailTemplate({
		preheader: 'Verify your email address to activate your StayVista account.',
		title: 'Verify your email address',
		intro: 'Welcome to StayVista. Before you can continue with login, bookings, and dashboard access, please confirm that this email address belongs to you.',
		primaryButtonLabel: 'Verify Email Address',
		primaryButtonUrl: url,
		closing: [
			'Use the verification button below to activate your account and complete the signup process.',
			'Once verified, you can sign in, complete your profile, and continue searching or listing stays on StayVista.'
		],
		sections: [
			{
				title: 'What you can do after verification',
				list: [
					'Sign in securely with your registered email address.',
					'Complete your rider or provider profile.',
					'Search, shortlist, book, or manage stays with full account access.'
				]
			},
			{
				title: 'Did not create this account?',
				paragraph: 'If you did not sign up for StayVista, you can safely ignore this email. No account access will be granted until the email address is verified.'
			}
		],
		fallbackText: 'If the verification button does not open in your mail app, copy and paste this link into your browser.',
		fallbackUrl: url,
		footerNote: 'This is an automated transactional email regarding account verification.'
	});
}

function createBookingSuccessEmail(details) {
	return createEmailTemplate({
		preheader: 'Your booking payment was received and your request is now being processed.',
		title: 'Your booking request was placed successfully',
		intro: `Hi ${details.customerName}, your booking request has been recorded successfully and your payment has been received. The property owner will review and finalize the booking from their side.`,
		closing: [
			'Please keep the booking details below for reference while the owner reviews your request.',
			'You can continue tracking the latest status of this booking from your StayVista dashboard.'
		],
		sections: [
			{
				title: 'Booking details',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Booking ID', value: details.bookingID},
							{label: 'Booking Date', value: details.bookingDate.toLocaleDateString('en-IN')},
							{label: 'Amount Paid', value: `INR ${details.amountPaid}`}
						]) +
					'</table>'
				)
			},
			{
				title: 'What happens next',
				list: [
					'The property owner will review your request.',
					'You will receive a follow-up update once the booking is accepted or declined.',
					'If the booking is denied, the refund process will be initiated as applicable.'
				]
			},
			{
				title: 'Need to stay updated?',
				paragraph: 'Check your rider dashboard regularly to view the latest booking status, property details, and next steps.'
			}
		],
		footerNote: 'This is an automated transactional email regarding your booking.'
	});
}

function createBookingFailEmail(details) {
	return createEmailTemplate({
		preheader: 'Your booking request could not be completed due to an internal processing issue.',
		title: 'Your booking could not be completed',
		intro: `Hi ${details.customerName}, we were unable to complete your booking request because of an internal processing issue. We understand this is inconvenient and we are sorry for the disruption.`,
		closing: [
			'The transaction details we received are listed below for your reference.',
			'Our team will treat this as a failed booking flow and the refund process will be handled according to the applicable payment process.'
		],
		sections: [
			{
				title: 'Payment reference',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Payment ID', value: details.paymentID},
							{label: 'Property ID', value: details.propertyID},
							{label: 'Payment Date', value: details.date.toLocaleDateString('en-IN')},
							{label: 'Amount Paid', value: `INR ${details.amountPaid}`}
						]) +
					'</table>'
				)
			},
			{
				title: 'What to expect next',
				list: [
					'The failed booking will not move to owner confirmation.',
					'Any applicable refund will be processed according to the payment timeline.',
					'You can try booking the property again later if it is still available.'
				]
			},
			{
				title: 'Need help?',
				paragraph: 'Keep this email for reference. If you need support, include the payment ID and property ID when contacting the StayVista team.'
			}
		],
		footerNote: 'This is an automated transactional email regarding a failed booking attempt.'
	});
}

function createBookingFinalSuccessEmail(content) {
	return createEmailTemplate({
		preheader: 'Your booking has been approved by the property owner.',
		title: 'Your booking is confirmed',
		intro: `Your booking for ${content.propName} has been approved by the property owner. You can now proceed with confidence and refer to the owner contact details below if needed.`,
		closing: [
			`Your booking ID is ${content.bookingID}. Keep it handy for future reference.`,
			'You can view the full booking status and related updates directly from your StayVista dashboard.'
		],
		sections: [
			{
				title: 'Confirmed booking',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Booking ID', value: content.bookingID},
							{label: 'Property', value: content.propName},
							{label: 'Status', value: 'Confirmed'}
						]) +
					'</table>'
				)
			},
			{
				title: 'Owner contact details',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Email', value: content.propEmail},
							{label: 'Phone', value: content.propPhone}
						]) +
					'</table>'
				)
			},
			{
				title: 'Suggested next steps',
				list: [
					'Review the booking on your dashboard.',
					'Reach out to the property owner if you need move-in details or clarifications.',
					'Keep your booking ID available for future reference.'
				]
			}
		],
		footerNote: 'This is an automated transactional email regarding your confirmed booking.'
	});
}

function createBookingFinalFailEmail(content) {
	return createEmailTemplate({
		preheader: 'Your booking request was reviewed and was not approved by the property owner.',
		title: 'Your booking was not approved',
		intro: `Your booking request for ${content.propName} was reviewed by the property owner and was not approved. We understand this can be disappointing, so the relevant contact details are included below if you need clarification.`,
		closing: [
			`Your booking ID is ${content.bookingID}. Keep it for reference if you need to follow up.`,
			'You can continue browsing other available listings on StayVista and place a new booking request whenever you are ready.'
		],
		sections: [
			{
				title: 'Booking update',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Booking ID', value: content.bookingID},
							{label: 'Property', value: content.propName},
							{label: 'Status', value: 'Declined'}
						]) +
					'</table>'
				)
			},
			{
				title: 'Owner contact details',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Email', value: content.propEmail},
							{label: 'Phone', value: content.propPhone}
						]) +
					'</table>'
				)
			},
			{
				title: 'What you can do next',
				list: [
					'Review the booking update in your dashboard.',
					'Contact the property owner if you need additional clarification.',
					'Continue exploring alternative stays and send a new booking request.'
				]
			}
		],
		footerNote: 'This is an automated transactional email regarding a declined booking.'
	});
}

function createBookingCancellationEmailForRider(content) {
	return createEmailTemplate({
		preheader: 'Your booking has been cancelled. Review the details and next steps below.',
		title: 'Your booking has been cancelled',
		intro: `Hi ${content.riderName}, your booking for ${content.propName} has been cancelled. We have included the cancellation details and reason below.`,
		closing: [
			`Your booking ID is ${content.bookingID}. Keep it for reference if needed.`,
			'You can start searching for alternative stays on StayVista or contact the property owner if you have any questions about this cancellation.'
		],
		sections: [
			{
				title: 'Cancellation details',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Booking ID', value: content.bookingID},
							{label: 'Property', value: content.propName},
							{label: 'Cancelled on', value: content.cancellationDate.toLocaleDateString('en-IN')},
							{label: 'Status', value: 'Cancelled'}
						]) +
					'</table>'
				)
			},
			{
				title: 'Cancellation reason',
				paragraph: content.cancellationReason || 'No specific reason was provided.'
			},
			{
				title: 'What to do next',
				list: [
					'Visit your StayVista dashboard to explore alternative stays.',
					'Contact the property owner if you need further clarification.',
					'Apply for a refund if applicable according to the booking terms.',
					'Continue your search for the perfect accommodation.'
				]
			}
		],
		footerNote: 'This is an automated transactional email regarding a booking cancellation.'
	});
}

function createBookingCancellationEmailForProvider(content) {
	return createEmailTemplate({
		preheader: 'A booking for one of your properties has been cancelled by the rider.',
		title: 'Booking cancellation notification',
		intro: `Hi ${content.providerName}, a booking for your property ${content.propName} has been cancelled by the rider ${content.riderName}. Details are included below.`,
		closing: [
			`The booking ID is ${content.bookingID}. Keep it for reference.`,
			'You can now make this property available for new bookings. If you need to contact the rider about this cancellation, use your messaging inbox to reach out.'
		],
		sections: [
			{
				title: 'Booking cancellation details',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Booking ID', value: content.bookingID},
							{label: 'Property', value: content.propName},
							{label: 'Rider', value: content.riderName},
							{label: 'Cancelled on', value: content.cancellationDate.toLocaleDateString('en-IN')},
							{label: 'Status', value: 'Cancelled'}
						]) +
					'</table>'
				)
			},
			{
				title: 'Cancellation reason',
				paragraph: content.cancellationReason || 'No specific reason was provided by the rider.'
			},
			{
				title: 'Next steps',
				list: [
					'Update the availability status of your property in the dashboard.',
					'Consider reaching out to the rider if you need clarification.',
					'Continue managing other active bookings and properties.'
				]
			}
		],
		footerNote: 'This is an automated transactional email regarding a booking cancellation.'
	});
}

function createForgotPasswordEmail(key) {
	const url = `${serverURL}/auth/change-password?key=${key}`;

	return createEmailTemplate({
		preheader: 'Use this secure link to reset your StayVista account password.',
		title: 'Reset your password',
		intro: 'We received a request to reset the password for your StayVista account. Use the secure action below to create a new password and restore access to your account.',
		primaryButtonLabel: 'Create New Password',
		primaryButtonUrl: url,
		closing: [
			'If you requested this change, continue using the password reset button below. For security reasons, we recommend completing this process only on a trusted device and on a secure internet connection.'
		],
		sections: [
			{
				title: 'What happens next',
				list: [
					'Open the secure reset link.',
					'Choose a new password that is strong and unique.',
					'Return to StayVista and sign in with your updated credentials.'
				]
			},
			{
				title: 'Security recommendations',
				list: [
					'Do not share this reset link with anyone.',
					'Choose a password you are not using on other websites.',
					'If you use a shared computer, sign out after changing your password.'
				]
			},
			{
				title: 'Did not request this?',
				paragraph: 'You can safely ignore this email if you did not initiate a password reset. Your current password will remain active until you change it using the secure link above. If you suspect unauthorized access, reset your password immediately and review your email account security as well.'
			}
		],
		fallbackText: 'If the button does not open in your mail app, copy and paste this link into your browser.',
		fallbackUrl: url,
		footerNote: 'This is an automated transactional email regarding your account security.'
	});
}

function createPasswordChangedEmail() {
	return createEmailTemplate({
		preheader: 'Your StayVista account password has been updated successfully.',
		title: 'Your password was changed',
		intro: 'This is a confirmation that your StayVista account password has been updated successfully and the new password is now active.',
		closing: [
			'You can now use your new password the next time you sign in to StayVista. If you changed it intentionally, no further action is required.'
		],
		sections: [
			{
				title: 'Recommended next steps',
				list: [
					'Sign in once to verify the new password works correctly.',
					'Update any saved password manager entries if needed.',
					'Keep your login email account secure, since it controls password recovery.'
				]
			},
			{
				title: 'Notice something unusual?',
				paragraph: 'If you did not make this change, reset your password again immediately and review access to your email account as well. This usually indicates that someone else may have had access to your account or inbox.'
			}
		],
		footerNote: 'This is an automated transactional email regarding your account security.'
	});
}

function createBookingOtpEmail(details) {
	return createEmailTemplate({
		preheader: 'Use this OTP to confirm your booking details before payment.',
		title: 'Confirm your booking details',
		intro: `We received a booking request for ${details.propertyName}. Before redirecting you to payment, please verify the one-time password below to confirm your booking details.`,
		closing: [
			'Enter the OTP exactly as shown below on the booking confirmation page.',
			'This extra step helps us verify the booking request before payment is initiated.'
		],
		sections: [
			{
				title: 'One-time password',
				html: `<div style="background:#ffffff; border:1px solid #e3edf2; border-radius:16px; padding:18px; text-align:center;"><div style="color:#163247; font-size:30px; font-weight:700; letter-spacing:0.32em;">${details.otp}</div><div style="color:#5e7687; font-size:13px; margin-top:8px;">Valid for 10 minutes</div></div>`
			},
			{
				title: 'Booking summary',
				html: (
					'<table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e3edf2; border-radius:14px; overflow:hidden;">' +
						renderKeyValueRows([
							{label: 'Property', value: details.propertyName},
							{label: 'Move-in Date', value: details.moveInDate},
							{label: 'Rooms Requested', value: String(details.roomsBooked)}
						]) +
					'</table>'
				)
			},
			{
				title: 'Security note',
				paragraph: 'Do not share this OTP with anyone. StayVista will never ask for this code over phone calls or unrelated messages.'
			}
		],
		footerNote: 'This is an automated transactional email regarding booking verification.'
	});
}

/* EMAIL SENDING FUNCTIONS */

async function sendRegistrationEmail(recipientAddress, validationKey) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Please verify your email address ",
		html: createValidationEmail(validationKey),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendBookingSuccessEmail(recipientAddress, details) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Booking Confirmation ",
		html: createBookingSuccessEmail(details),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendBookingFailEmail(recipientAddress, details) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Booking Confirmation ",
		html: createBookingFailEmail(details),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendForgotPasswordEmail(recipientAddress, key) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Forgot Password ",
		html: createForgotPasswordEmail(key),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendPasswordChangeEmail(recipientAddress) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Password Changed ",
		html: createPasswordChangedEmail(),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendBookingOtpEmail(recipientAddress, details) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Booking Verification OTP ",
		html: createBookingOtpEmail(details),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendBookingFinalSuccessEmail(recipientAddress, content) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Booking Finalized ",
		html: createBookingFinalSuccessEmail(content),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendBookingFinalFailEmail(recipientAddress, content) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Booking Finalized ",
		html: createBookingFinalFailEmail(content),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendBookingCancellationEmailForRider(recipientAddress, content) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Booking Cancelled ",
		html: createBookingCancellationEmailForRider(content),
	};

	return await transporter.sendMail(mailOptions);
}

async function sendBookingCancellationEmailForProvider(recipientAddress, content) {
	const mailOptions = {
		from: emailAdd,
		to: recipientAddress,
		subject: "StayVista | Booking Cancelled by Rider ",
		html: createBookingCancellationEmailForProvider(content),
	};

	return await transporter.sendMail(mailOptions);
}

module.exports = {
	sendRegistrationEmail,
	sendBookingSuccessEmail,
	sendBookingFailEmail,
	sendForgotPasswordEmail,
	sendPasswordChangeEmail,
	sendBookingOtpEmail,
	sendBookingFinalSuccessEmail,
	sendBookingFinalFailEmail,
	sendBookingCancellationEmailForRider,
	sendBookingCancellationEmailForProvider,
}
