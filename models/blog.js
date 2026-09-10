const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
    category: { type: String, required: true, enum: ['Academic', 'Events', 'Student Life', 'Technology', 'Other'] },
    tags: {
        type: [String], required: true,
        validate: {
            validator: (tags) => tags.length >= 1 && tags.length <= 5 &&
                tags.every((tag) => tag.trim().length > 0 && tag.length <= 30) &&
                new Set(tags).size === tags.length,
            message: 'Enter 1-5 unique tags, up to 30 characters each.',
        },
    },
    content: { type: String, required: true, trim: true, minlength: 20, maxlength: 5000 },
    image: { type: String, required: true },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

blogSchema.index({ deletedAt: 1, createdAt: -1 });

const Blog = mongoose.model('Blog', blogSchema);

const blogcommentSchema = new mongoose.Schema({
    blogId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Blog',
        required: true,
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    content: { type: String, required: true, trim: true, minlength: 2, maxlength: 500 },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

blogcommentSchema.index({ blogId: 1, deletedAt: 1, createdAt: 1 });

const BlogComment = mongoose.model('BlogComment', blogcommentSchema);

module.exports = { Blog, BlogComment };
