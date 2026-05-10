const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const {CloudinaryStorage} = require("multer-storage-cloudinary");
const {cloudName, cloudinaryApiKey, cloudinaryApiSecret} = require('../config');

cloudinary.config({
	cloud_name: cloudName,
	api_key: cloudinaryApiKey,
	api_secret: cloudinaryApiSecret
});

const riderStorage = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		folder: 'user-files',
	},
	allowedFormats: ["jpg", "jpeg", "png", "pdf"]
});

const propertyImages = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		folder: 'properties',
		resource_type: 'image',
	},
});

const propertyVideos = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		folder: 'properties',
		resource_type: 'video',
	},
});

const providerFiles = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		folder: 'provider-files',
		resource_type: 'auto',
	},
});

const uploadRiderFiles = multer({
	storage: riderStorage,
	limits: {
		fileSize: 1024 * 1024 * 2
	},
	fileFilter (req, file, cb) {
		if (!file.originalname.match(/\.(png|jpg|jpeg|pdf)$/i))
			return cb(new Error('Please upload files in correct format!'));

		cb (undefined, true);
	}
})

const uploadProviderFiles = multer({
	storage: providerFiles,
	limits: {
		fileSize: 1024 * 1024 * 8
	}
})

const uploadPropertyImages = multer ({
	storage: propertyImages,
	limits: {
		fileSize: 1024 * 1024 * 5 // 5 MB
	}
});

const uploadPropertyVideos = multer ({
	storage: propertyVideos,
	limits: {
		fileSize: 1024 * 1024 * 50 // 50 MB
	},
	fileFilter (req, file, cb) {
		if (!file.mimetype.startsWith('video/'))
			return cb(new Error('Please upload video files only!'));

		cb (undefined, true);
	}
});

// Combined uploader for both images and videos
const uploadPropertyMedia = multer({
	storage: new CloudinaryStorage({
		cloudinary: cloudinary,
		params: async (req, file) => {
			// Determine resource type based on field name
			let resourceType = 'image';
			if (file.fieldname === 'property-videos' || file.mimetype.startsWith('video/')) {
				resourceType = 'video';
			}
			
			return {
				folder: 'properties',
				resource_type: resourceType,
			};
		}
	}),
	limits: {
		fileSize: 1024 * 1024 * 50 // 50 MB for videos, images will be smaller
	},
	fileFilter (req, file, cb) {
		if (file.fieldname === 'property-videos') {
			if (!file.mimetype.startsWith('video/')) {
				return cb(new Error('Please upload video files only for the videos field!'));
			}
		}
		if (file.fieldname === 'property-image') {
			if (!file.mimetype.startsWith('image/')) {
				return cb(new Error('Please upload image files only for the images field!'));
			}
		}
		cb(undefined, true);
	}
});

module.exports = {
	uploadRiderFiles,
	uploadProviderFiles,
	uploadPropertyImages,
	uploadPropertyVideos,
	uploadPropertyMedia
}
