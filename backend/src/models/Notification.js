import mongoose from 'mongoose'

const { Schema, model } = mongoose

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // recipient
    type: { type: String, default: 'info' }, // application | status | interview | flag | info
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' }, // in-app route to open
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
)

notificationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

export default model('Notification', notificationSchema)
