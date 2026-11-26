exports.register = function () {
  this.inherits('auth/flat_file')
  this.blankout_password = true
}

// Даже в приватной сети AUTH доступен только после TLS.
exports.hook_capabilities = function (next, connection) {
  if (!connection.tls.enabled) return next()
  return this.base['auth/flat_file'].hook_capabilities.call(this, next, connection)
}
