function basePlugin(schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      delete ret.password;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      return ret;
    },
  });
  schema.set('toObject', { virtuals: true, versionKey: false });
}

module.exports = basePlugin;
