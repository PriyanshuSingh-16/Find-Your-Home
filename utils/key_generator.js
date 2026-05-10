const validationKeyLen = 16;
const paymentKeyLen = 32;
const forgetPasswordKey = 16;
const bookingOtpLen = 6;
const elements = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";

function generateValidationKey () {
	let key = '';

	while (key.length < validationKeyLen)
		key += elements.charAt(Math.floor(Math.random()*elements.length));

	return key;
}

function paymentKeyGenerator () {
	let key = '';

	while (key.length < paymentKeyLen)
		key += elements.charAt(Math.floor(Math.random()*elements.length));

	return key;
}

function forgetPasswordKeyGenerator () {
	let key = '';

	while (key.length < forgetPasswordKey)
		key += elements.charAt(Math.floor(Math.random()*elements.length));

	return key;
}

function bookingOtpGenerator () {
	let key = '';

	while (key.length < bookingOtpLen)
		key += Math.floor(Math.random() * 10).toString();

	return key;
}

module.exports = {
	generateValidationKey,
	paymentKeyGenerator,
	forgetPasswordKeyGenerator,
	bookingOtpGenerator
}
