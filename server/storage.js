'use strict';

var Storage = require('request');
var fs = require('fs');

// Configuration
var subdomain = 'is0006';
var user      = 'is0006';
var pwd       = '';
var endpoint  = 'nos-eu-mad-1.instantservers.telefonica.com';
var baseUrl   = 'https://' + subdomain + '.' + endpoint;

function bucketName(uid) {
  return 'gallery' + '_' + uid;
}

function storageCb(cb, error, response, body) {
  if (error) {
    cb(error, null);
    return;
  }
  if (response.statusCode === 201 || response.statusCode === 200) {
    cb(null, body);
  }
  else {
    cb(response.statusCode, null);
  }
}

// Creates a bucket for a Facebook uid
function createBucketForUser(uid, cb) {
  Storage.post({
    url: baseUrl + '/' + bucketName(uid),
    headers: {
      'Content-Type': 'application/castorcontext'
    },
  }, storageCb.bind(null, cb)).auth(user, pwd, true);
}

// Uploads media to the bucket corresponding to the uid
// Content is an stream ready to be piped to instant storage
function uploadMedia(uid, req, metadata, cb) {
  var bodyStream = fs.createReadStream(req.files['media'].path);
  bodyStream.pipe(Storage.post(baseUrl + '/' + bucketName(uid) + '/' +
      metadata.fileName, storageCb.bind(null, function() {
        // The media thumbnail is also stored
        var bodyStream = fs.createReadStream(req.files['thumbnail'].path);
        bodyStream.pipe(Storage.post(baseUrl + '/' + bucketName(uid) + '/' +
        metadata.fileName + '_thumb', storageCb.bind(null, cb)
        ).auth(user, pwd, true));
      })
  ).auth(user, pwd, true));
}

// Lists all the stored media corresponding to the uid
function listMedia(uid, cb) {
  Storage(baseUrl + '/' + bucketName(uid) + '?format=json',
          storageCb.bind(null, cb)).auth(user, pwd, true);
}

function listBuckets(cb) {
  Storage(baseUrl + '?format=json', storageCb.bind(null, cb)).
            auth(user, pwd, true);
}

function getMedia(uid, mediaId, cb) {
  return Storage(baseUrl + '/' + bucketName(uid) +
                  '/' + encodeURIComponent(mediaId),
                  storageCb.bind(null, cb)).auth(user, pwd, true);
}

function getThumbnail4Media(uid, mediaId, cb) {
  return getMedia(uid, mediaId + '_thumb', cb);
}

function deleteAllMedia(uid, cb) {
  Storage.del(baseUrl + '/' + bucketName(uid) + '?recursive=yes',
    storageCb.bind(null, function(err, result) {
      if (err) {
        cb(err);
        return;
      }
      // Once all media has been deleted the bucket is re-created
      createBucketForUser(uid, cb);
      })
    ).auth(user, pwd, true);
}

function deleteMedia(uid, mediaId, cb) {
  Storage.del(baseUrl + '/' + bucketName(uid) +'/' + mediaId,
    storageCb.bind(null, function(err, result) {
      if (err) {
        cb(err);
        return;
      }
      // Now it is needed to also delete the thumbnail
      Storage.del(baseUrl + '/' + bucketName(uid) +'/' + mediaId + '_thumb',
                  storageCb.bind(null, cb)).auth(user, pwd, true);
    })
    ).auth(user, pwd, true);
}

exports.createBucketForUser = createBucketForUser;
exports.uploadMedia = uploadMedia;
exports.listBuckets = listBuckets;
exports.listMedia   = listMedia;
exports.getMedia    = getMedia;
exports.getThumbnail4Media = getThumbnail4Media;
exports.deleteAllMedia = deleteAllMedia;
exports.deleteMedia = deleteMedia;
