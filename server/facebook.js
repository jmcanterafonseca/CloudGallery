'use strict';

var AUTH_SERVER   = 'https://graph.facebook.com/oauth/access_token?';
var CLIENT_ID     = '1384349841816348';
var REDIRECT_URI  = 'http://5.255.150.180/redirection';
var CLIENT_SECRET = '';
var END_POINT = 'https://www.facebook.com/dialog/oauth/?';
var SCOPE = ['friends_about_me', 'user_photos', 'publish_stream'];

var AUTH_URI = 'https://www.facebook.com/dialog/oauth?';
var DESKTOP_APP_URI = 'https://apps.facebook.com/tid_myprivategallery/';

var QUERY_SERVER = 'https://graph.facebook.com/fql?q=';
var QUERY_UID = 'select uid, name from user where uid=me()';
var QUERY_ALBUMS = 'https://graph.facebook.com/me/albums';

var POST_PHOTO = 'https://graph.facebook.com/';

var Rest   = require('./http_rest');
var crypto = require('crypto');
var b64url = require('b64url');
var Request = require('request');

function startOAuth(req, resp) {
  console.log('Starting flow ...');
  var redirect_uri = encodeURIComponent(REDIRECT_URI);

  var scope = SCOPE.join(',');
  var scopeParam = encodeURIComponent(scope);

  var queryParams = ['client_id=' + CLIENT_ID,
                      'redirect_uri=' + redirect_uri,
                      'response_type=code',
                      'scope=' + scopeParam,
                      'state=' + 'gallery_front'
  ]; // Query params

  var query = queryParams.join('&');
  var url = END_POINT + query;

  resp.writeHead(301, {
    Location: url
  });
  resp.end();
}

function getToken(code, cb) {
  var params = [
    'client_id=' + CLIENT_ID,
    'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
    'client_secret=' + CLIENT_SECRET,
    'code=' + code
  ];
  var url = AUTH_SERVER + params.join('&');
  Rest.get(url, function code_ready(error, response) {
    if (error) {
      cb(error, null);
      return;
    }

    var params = {};

    var subparams = response.split('&');
    subparams.forEach(function(sp) {
      var aux = sp.split('=');
      params[aux[0]] = aux[1];
    });

    cb(null, params);
  });
}

function getUid(access_token, cb) {
  var url = QUERY_SERVER + encodeURIComponent(QUERY_UID) + '&' +
  'access_token=' + access_token;

  Rest.get(url, function response_ready(error, response) {
    if(error || response.error) {
      cb(error || response.error);
      return;
    }

    cb(null, JSON.parse(response).data[0].uid);
  });
}

function parseSignedRequest(signed_request) {
  var out = null;

  var parts = signed_request.trim().split('.');

  var signature = parts[0];
  var payload = parts[1];

  var hmac = crypto.createHmac('sha256', CLIENT_SECRET);
  hmac.write(payload);

  var result = hmac.digest('base64').replace(/\+/g,'-').replace(/\//g,'_').
                                                              replace('=','');

  if (result === signature) {
    console.log('Signature verified!!');
    var json = b64url.decode(payload);
    out = JSON.parse(json);
  }

  return out;
}

function getAuthRedirect() {
  var params = [
    'client_id=' + CLIENT_ID,
    'redirect_uri=' + encodeURIComponent(DESKTOP_APP_URI)
  ];
  return 'https://graph.facebook.com/oauth/authorize?' + params.join('&');
}

function getAlbums(access_token, cb) {
  var url = QUERY_ALBUMS + '?access_token=' + access_token;
  Rest.get(url, function got_albums(err, data) {
    if (err) {
      cb(err);
      return;
    }
    var out = [];
    var parsedResponse = JSON.parse(data);
    parsedResponse.data.forEach(function(aAlbum) {
      if (aAlbum.can_upload) {
        out.push({
          id: aAlbum.id,
          name: aAlbum.name
        });
      }
    });
    cb(null, out);
  });
}

function postToAlbum(access_token, albumId, mediaContent, cb) {
  var uri = POST_PHOTO + '/' + albumId + '/photos' +
  '?access_token=' + access_token;

  var r = Request.post(uri, function(err, ir, body) {
    if (err) {
      cb(err);
      return;
    }
    var response = JSON.parse(body);
    cb(null, response.post_id);
  });

  var form = r.form();
  form.append('source', mediaContent);
  form.append('message', 'Cloud Photo');
}

exports.getToken = getToken;
exports.startOAuth = startOAuth;
exports.getUid = getUid;
exports.parseSignedRequest = parseSignedRequest;
exports.getAuthRedirect = getAuthRedirect;
exports.getAlbums = getAlbums;
exports.postToAlbum = postToAlbum;
