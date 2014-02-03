var fs = require('fs');
var http = require('http');
var https = require('https');
var URL = require('url');
var QueryString = require('querystring');

var privateKey  = fs.readFileSync('sslcert/private.key', 'utf8');
var certificate = fs.readFileSync('sslcert/cacert.pem', 'utf8');
var redis = require('redis'),
    client = redis.createClient();

var loggerStream = fs.createWriteStream('./log.txt', {
  flags: 'a',
  encoding: 'utf-8',
  mode: '0666'
});

var credentials = {
  key: privateKey,
  cert: certificate
};

var Facebook = require('./facebook');
var Storage  = require('./storage');

var Request = require('request');

var express = require('express');
var app = express();

app.configure(function() {
  app.use('/html', express.static(__dirname + '/html'));
  app.use('/gallery/static', express.static(__dirname + '/html/gallery'));
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger({format: 'dev', stream: loggerStream}));
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({secret: '1234567890QWERTY'}));
});

// Name of the hash that maps access_token to UIDs in Redis
var UID_HASH = 'UidHash';
var TOKEN_SET = 'TokenHash';
var VERSION_HASH = 'VersionHash';
// Correspondence between access_tokens and push tokens
var PUSH_TOKEN_HASH = 'PushTokenHash';

// Maps a token to a uid
function token2Uid(access_token, cb) {
  client.hget(UID_HASH, access_token, cb);
}

function uid2Token(uid, cb) {
  client.smembers(TOKEN_SET + '_' + uid, function(error, list) {
    if (error) {
      cb(error);
      return;
    }
    cb(null, list[0]);
  });
}

// Updates the gallery version
function updateGalleryVersion(uid, cb) {
  client.hget(VERSION_HASH, uid, function(err, data) {
    if (err) {
      cb(err);
    }
    if (!data) {
      data = 1;
    }
    data++;
    client.hset(VERSION_HASH, uid, data, function(err, resp) {
      if (err) {
        cb(err);
        return;
      }
      cb(null, data);
    });
  });
}

function getGalleryVersion(uid, cb) {
  client.hget(VERSION_HASH, uid, function(err, data) {
    if (err) {
      cb(err);
      return;
    }
    cb(null, data);
  });
}

function notifyGalleryChanges(uid, access_token, newVersion, cb) {
  // For that uid all the access_tokens are obtained
  // Excepting the one that make the change
  // And the new version is just notified
  client.smembers(TOKEN_SET + '_' + uid, function(err, list) {
    if (err) {
      cb(err);
      return;
    }
    list.forEach(function(aToken) {
      if (aToken !== access_token) {
        client.hget(PUSH_TOKEN_HASH, aToken, function(err, endPoint) {
          if (err) {
            cb(err);
            return;
          }
          console.log('End point to notify changes: ', endPoint);
          Request.put({
            url: endPoint,
            body: 'version=' + newVersion,
            strictSSL: false
          }, function(err, response, body) {
            if (err) {
              cb(err);
              return;
            }
            console.log('Body response: ', body);
            var res = JSON.parse(body);
            if (!res.reason) {
              cb(null, 'ok');
            }
            else {
              cb(res);
            }
          });
        });
      }
    });
  });
}

app.get('/hello', function(req, res) {
  var body = 'Hello World';
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Length', body.length);
  res.end(body);
});

app.get('/hello.html', function(req, res) {
  res.sendfile('hello.html', {root: __dirname + '/html'});
});

app.post('/upload_media', function(req, resp) {
  var url = URL.parse(req.originalUrl);
  var params = QueryString.parse(url.query);

  var access_token = params.access_token;
  var fileName = params.file_name;

  token2Uid(access_token, function(error, uid) {
    if (error) {
      console.error(error);
      resp.send(500);
      return;
    }
    console.log('Token: ', access_token, 'File: ', fileName, 'uid: ', uid);

    Storage.uploadMedia(uid, req, {
      fileName: fileName,
    }, function(error, response) {
      if (error) {
        console.error('Error while uploading!!!');
        resp.send(500);
        return;
      }
      console.log('Uploaded correctly!!', response);
      client.lpush('list_' + uid, fileName);
      resp.send(200);
      updateGalleryVersion(uid, function(err, newVersion) {
        if (err) {
          console.error('Error while updating gallery version');
          return;
        }
        process.nextTick(function() {
          notifyGalleryChanges(uid, access_token, newVersion, function(err, res) {
            if (err) {
              console.error('Error while notifying Gallery Changes');
              return;
            }
            console.log('Gallery changes have been notified properly');
          });
        });
      });
    });
  });
});

app.get('/list_buckets', function(req, resp) {
  var url = URL.parse(req.originalUrl);
  var params = QueryString.parse(url.query);
  var access_token = params.access_token;

  if (!access_token) {
    resp.send(404);
    return;
  }

  // It is needed to check whether the access_token exists or not
  client.hexists(UID_HASH, access_token, function(err, result) {
    if (err) {
      return;
    }

    if (result) {
      Storage.listBuckets(function(err, result) {
        if (err) {
          console.error(err);
          return;
        }
        resp.type('json');
        resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
        resp.send(new Buffer(result));
      });
    }
    else {
      resp.send(404);
    }
  });
});

// Deletes all media content of a user including the bucket
app.get('/delete_all_media', function(req, resp) {
  var url = URL.parse(req.originalUrl);
  var params = QueryString.parse(url.query);
  var access_token = params.access_token;

  token2Uid(access_token, function(err, uid) {
    if (err) {
      resp.send(500);
      return;
    }
    Storage.deleteAllMedia(uid, function(err, result) {
      if (err) {
        res.send(500);
        return;
      }
      client.del('list_' + uid, function(err, result) {
        console.error('Error while deleting the list', err);
      });
      resp.send(200);
    });
  });
});

function listResources(uid, cb) {
  client.lrange('list_' + uid, 0, 10000, function(err, result) {
    if (err) {
      cb(err);
      return;
    }
    cb(null, result);
  });
}

app.get('/list_media_fast', function(req, resp) {
  var url = URL.parse(req.originalUrl);
  var params = QueryString.parse(url.query);
  var access_token = params.access_token;

  // It is needed to check whether the access_token exists or not
  token2Uid(access_token, function(err, uid) {
    if (err) {
      return;
    }

    if (uid) {
      resp.type('json');
      resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
      listResources(uid, function(err, result) {
        if (err) {
          console.log(err);
          resp.send(500);
          return;
        }
        var obj = {
          data: result
        }
        resp.send(obj);
      });
    }
    else {
      resp.send(404);
    }
  });
});

app.get('/list_media', function(req, resp) {
  var url = URL.parse(req.originalUrl);
  var params = QueryString.parse(url.query);
  var access_token = params.access_token;

  if (!access_token) {
    resp.send(404);
    return;
  }

  // It is needed to check whether the access_token exists or not
  token2Uid(access_token, function(err, uid) {
    if (err) {
      return;
    }

    if (uid) {
      Storage.listMedia(uid, function(err, result) {
        if (err) {
          console.error(err);
          return;
        }
        resp.type('json');
        resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
        resp.send(new Buffer(result));
      });
    }
    else {
      resp.send(404);
    }
  });
});

app.delete('/media/:id', function(req, resp) {
  console.log('Delete invoked');

  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  console.log(params);
  var access_token = queryParams.access_token;
  if (!access_token || !params.id) {
    resp.send(404);
    return;
  }

  token2Uid(access_token, function(err, uid) {
    console.log('Token2UID: ', uid);
    if (!uid) {
      resp.send(404);
      return;
    }
    client.lrange('list_' + uid, 0, 10000, function(err, response) {
      if (err) {
        console.error(err);
        return;
      }
      console.log('LRange: ', response);
      if (response.indexOf(params.id) !== -1) {
        Storage.deleteMedia(uid, params.id, function(err, data) {
          if (err) {
            console.error('Error while deleting media');
            return;
          }
          client.lrem('list_' + uid, 1, params.id, function(err,result) {
            if (err) {
              console.error('Item was not deleted from the list', err);
              return;
            }
            console.log('Mediaid: ', params.id, 'was removed');
            updateGalleryVersion(uid, function(err, newVersion) {
              if (err) {
                console.error('Error while updating gallery version');
                return;
              }
              process.nextTick(function() {
                notifyGalleryChanges(uid, access_token, newVersion,
                  function(err, data) {
                    if (err) {
                      console.error('Error while notifying changes: ', err);
                      return;
                    }
                    console.log('Notification was successful');
                });
              });
            });
            resp.send({
              success: true
            });
          });
        });
      }
      else {
        resp.send(404);
      }
    });
  });
});

// Get the media passed as id
app.get('/media/:id', function(req, resp) {
  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  console.log(params);
  var access_token = queryParams.access_token;
  if (!access_token || !params.id) {
    resp.send(404);
    return;
  }
  var thumbnail = (queryParams.th === '1');

  token2Uid(access_token, function(err, uid) {
    if (!uid) {
      resp.send(404);
      return;
    }
    client.lrange('list_' + uid, 0, 10000, function(err, response) {
      if (err) {
        console.error(err);
        return;
      }
      console.log('LRange: ', response);
      if (response.indexOf(params.id) !== -1) {
        if (thumbnail) {
          Storage.getThumbnail4Media(uid, params.id, function() {}).pipe(resp);
        }
        else {
          Storage.getMedia(uid, params.id, function() {}).pipe(resp);
        }
        // resp.setHeader("Expires", new Date(Date.now() + 345600000).toUTCString());
      }
      else {
        resp.send(404);
      }
    });
  });
});

app.get('/list_albums', function(req, resp) {
  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  console.log(params);
  var access_token = queryParams.access_token;

  if (!access_token) {
    resp.send(404);
  }

  Facebook.getAlbums(access_token, function(error, albums) {
    if (error) {
      resp.send(500);
    }
    else {
      resp.send(albums);
    }
  });
});


app.post('/upload_media_facebook/:albumId/:mediaId', function(req, resp) {
  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  var access_token = queryParams.access_token;
  var mediaId = params.mediaId;
  var albumId = params.albumId;

  console.log(mediaId, albumId);

  if (!access_token || !albumId || !mediaId) {
    resp.send(404);
    return;
  }

  token2Uid(access_token, function(err, uid) {
    if (!uid) {
      resp.send(404);
      return;
    }
    client.lrange('list_' + uid, 0, 10000, function(err, response) {
      if (err) {
        console.error(err);
        return;
      }
      console.log('LRange: ', response);
      if (response.indexOf(mediaId) !== -1) {
        Facebook.postToAlbum(access_token, albumId,
                             Storage.getMedia(uid, mediaId, function() {}),
                             function(err, result) {
                              if (err) {
                                console.log(err);
                                return;
                              }
                              resp.send({
                                success: true
                              })
                             });
      }
      else {
        resp.send(404);
      }
    });
  });
});

// Here the OAuthFlow is managed
app.get('/redirection', function(req, res) {
  var redirectUrl = req.originalUrl;
  var params = URL.parse(redirectUrl).search;
  var authParams = {};

  var subparams = params.substring(1).split('&');
  subparams.forEach(function(sp) {
    var aux = sp.split('=');
    authParams[aux[0]] = aux[1];
  });

  var code = authParams['code'];

  var state = authParams['state'];

  Facebook.getToken(code, function got_token(err, params) {
    var access_token = params['access_token'];
    process.nextTick(function() {
      Facebook.getUid(access_token, function(err, uid) {
        console.log('UID: ', uid);
        // Now the relationship between the token and the uid is captured
        client.hset(UID_HASH, access_token, uid, function(err, res) {
          if (err) {
            console.error('Error while setting the hash: ', err);
            return;
          }
        });
        client.sadd(TOKEN_SET  + '_' + uid, access_token, function(err, res) {
          if (err) {
            console.error('Error while setting the set: ', err);
            return;
          }
        });
        Storage.createBucketForUser(uid, function(err, res) {
          if (err) {
            console.error(err.message);
            return;
          }
          console.log('Bucket successfully created');
        });
        if (state === 'gallery_front') {
          req.session.access_token = access_token;
          res.writeHead(301, {
            Location: '/gallery_front'
          });
          res.end();
        }
      });
    });

    if (state !== 'gallery_front') {
      res.render('redirector.ejs', {
        token: access_token
      });
    }
  });
});

app.get('/logout', function(req, resp) {
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  var access_token = queryParams.access_token;

  req.session.access_token = null;

  var logoutService = 'https://www.facebook.com/logout.php?';
  var params = [
    'next' + '=' + encodeURIComponent('https://www.facebook.com/connect/login_success.html'),
    'access_token' + '=' + access_token
  ];

  var logoutParams = params.join('&');
  var logoutUrl = logoutService + logoutParams;

  resp.writeHead(301, {
    Location: logoutUrl
  });
  resp.end();
});

app.get('/logout_redirect', function(req, resp) {
  console.log('Logout redirect ...');
  resp.render('logout.ejs');
});


app.post('/push_token_register', function(req, resp) {
  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  var access_token = queryParams.access_token;
  var push_token = queryParams.push_token;

  if (!access_token || !push_token) {
    resp.send(404);
    return;
  }

  client.hset(PUSH_TOKEN_HASH, access_token, push_token, function(err, res) {
    if (err) {
      resp.send(500);
      return;
    }
    resp.send(200);
  });
});

app.post('/push_token_unregister', function(req, resp) {
  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  var access_token = queryParams.access_token;
  var push_token = queryParams.push_token;

  if (!access_token || !push_token) {
    resp.send(404);
    return;
  }

  client.hdel(PUSH_TOKEN_HASH, access_token, function(err, res) {
    if (err) {
      resp.send(500);
      return;
    }
    resp.send(200);
  });
});

app.get('/gallery_front', function(req, resp) {
  var access_token = req.session.access_token;

  console.log('Access token from session', access_token);

  if (!access_token) {
    // Let's start the oauth flow
    Facebook.startOAuth(req, resp, function(err, access_token) {
    });
  }
  else {
    token2Uid(access_token, function(err, uid) {
      if (err) {
        resp.send(500);
        return;
      }
      listResources(uid, function(err, data) {
        if (err) {
          resp.send(500);
          return;
        }
        resp.render('gallery/gallery.ejs', {
          media: data,
          access_token: access_token
        });
      });
    });
  }
});

// Invoked from the canvas page in Facebook
app.post('/gallery', function(req, resp) {
  console.log('Gallery');
  var signed_request = req.body.signed_request;
  var url = URL.parse(req.originalUrl);
  var params = QueryString.parse(url.query);

  // Check whether the user didn't allow this app
  if (params.error) {
    resp.send(200);
    return;
  }

  var userData = Facebook.parseSignedRequest(signed_request);

  if (!userData) {
    resp.send(404);
    return;
  }

  if (!userData.user_id) {
    /*
    resp.send('<script>top.location.href="' + Facebook.getAuthRedirect() +
    '"' + '</script>'); */
    userData.user_id = '100001127136581';
    return;
  }

  var uid = userData.user_id;

  listResources(uid, function(err, data) {
    if (err) {
      resp.send(500);
      return;
    }
    uid2Token(uid, function(err, token) {
      if (err) {
        resp.send(500);
      }
      if (!token) {
        resp.send(500);
        return;
      }
      resp.render('gallery/gallery.ejs', {
        media: data,
        access_token: token
      });
    });
  });
});

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(80);
httpsServer.listen(443);

console.log('Server up and running');
