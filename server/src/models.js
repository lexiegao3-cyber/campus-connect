import mongoose, { Schema } from "mongoose";
import { ACTIVITY_STATUS, CATEGORIES, LEVELS, NOTIFICATION_TYPES, SPORTS } from "./vocab.js";

/** GeoJSON point; MongoDB stores [lng, lat]. */
const pointSchema = new Schema(
  { type: { type: String, enum: ["Point"], required: true }, coordinates: { type: [Number], required: true } },
  { _id: false },
);

const placeSchema = new Schema(
  { name: { type: String, required: true, maxlength: 120 }, point: { type: pointSchema, required: false } },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, maxlength: 60 },
    school: {
      domain: { type: String, required: true, index: true },
      name: { type: String, required: true },
      country: { type: String, default: "" },
    },
    googleSub: { type: String, sparse: true, unique: true },
    tz: { type: String, default: "America/New_York" },
    lang: { type: String, enum: ["en", "zh"], default: "en" },
    blocked: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true },
);

const participantSchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: "User", required: true }, joinedAt: { type: Date, default: () => new Date() } },
  { _id: false },
);

/** "Badminton at Pottruck, Wed 6–8 pm, need 3 more": a host's post others can join. */
const activitySchema = new Schema(
  {
    host: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    school: { type: String, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    sport: { type: String, enum: [...SPORTS, null], default: null },
    level: { type: String, enum: LEVELS, default: "any" },
    title: { type: String, required: true, maxlength: 80 },
    notes: { type: String, default: "", maxlength: 500 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    /** Fill-by deadline: if spots are still open then, the host decides to start or cancel. */
    fillBy: { type: Date, required: true },
    /** Total people including the host. */
    capacity: { type: Number, required: true, min: 2, max: 50 },
    participants: { type: [participantSchema], default: [] },
    /** Public, approximate place ("near Pottruck Gym"); the exact spot is shown only to people who joined. */
    area: { type: placeSchema, required: true },
    exactLocation: { type: String, default: "", maxlength: 200 },
    status: { type: String, enum: ACTIVITY_STATUS, default: "open" },
    decidedAt: Date,
  },
  { timestamps: true },
);
activitySchema.index({ school: 1, status: 1, startsAt: 1 });
activitySchema.index({ "area.point": "2dsphere" });
activitySchema.index({ status: 1, fillBy: 1 });
activitySchema.index({ status: 1, startsAt: 1 });
activitySchema.index({ "participants.user": 1, startsAt: 1 });

/** "I want to play badminton, weekday evenings this week, intermediate": waits for a match. */
const seekSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    school: { type: String, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    sport: { type: String, enum: [...SPORTS, null], default: null },
    level: { type: String, enum: LEVELS, default: "any" },
    note: { type: String, default: "", maxlength: 300 },
    availability: {
      from: { type: String, required: true },
      to: { type: String, required: true },
      days: { type: [Number], required: true },
      start: { type: String, required: true },
      end: { type: String, required: true },
      tz: { type: String, required: true },
    },
    area: { type: placeSchema, required: false },
    maxDistanceKm: { type: Number, default: 5, min: 0.5, max: 50 },
    active: { type: Boolean, default: true },
    /** End of the last day of availability; past this the post stops matching. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
seekSchema.index({ school: 1, category: 1, active: 1, expiresAt: 1 });
seekSchema.index({ "area.point": "2dsphere" });

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    activity: { type: Schema.Types.ObjectId, ref: "Activity" },
    seek: { type: Schema.Types.ObjectId, ref: "Seek" },
    params: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetUser: { type: Schema.Types.ObjectId, ref: "User" },
    activity: { type: Schema.Types.ObjectId, ref: "Activity" },
    reason: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
export const Activity = mongoose.model("Activity", activitySchema);
export const Seek = mongoose.model("Seek", seekSchema);
export const Notification = mongoose.model("Notification", notificationSchema);
export const Report = mongoose.model("Report", reportSchema);

export const toPoint = (p) => (p ? { type: "Point", coordinates: [p.lng, p.lat] } : undefined);
export const fromPoint = (p) =>
  p?.coordinates?.length === 2 ? { lat: p.coordinates[1], lng: p.coordinates[0] } : null;
