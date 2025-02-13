const ddoc = {
  _id: '_design/submission',
  views: {}
}

ddoc.views.by_email = {
  map: function (doc) {
    if (!doc.application) return
    if (!doc.application.email) return
    emit(doc.application.email, null) // eslint-disable-line
  }
}

module.exports = ddoc
