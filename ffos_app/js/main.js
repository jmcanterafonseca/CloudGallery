'use strict';

window.console.log('main.js loaded ...');

var inActivity = false;
var activity;

var GALLERY_SERVER_REGISTER = 'http://5.255.150.180/push_token_register';
var GALLERY_SERVER_UNREGISTER = 'http://5.255.150.180/push_token_unregister';

function registerPush(access_token) {
  window.asyncStorage.getItem('pushToken', function(data) {
    if (!data) {
      var req = navigator.push.register();
      req.onsuccess = function() {
        var endPoint = req.result;
        var url = GALLERY_SERVER_REGISTER + '?access_token=' + access_token +
        '&push_token=' + endPoint;
        Rest.get(url, {
          success: function() {
            console.log('Successfully registered on the server: ', endPoint);
            window.asyncStorage.setItem('pushToken', endPoint, function() {
              console.log('Push token stored correctly');
            });
          },
          error: function() {
            console.error('Error while registering the push endpoint');
          }
        }, {
              operationsTimeout: 10000,
              method: 'POST'
        });
      };
      req.onerror = function() {
        console.error('Error while registering push: ', req.error.name);
      };
    }
  });
}

function unregisterPush(access_token, cb) {
  window.asyncStorage.getItem('pushToken', function(endPoint) {
    if (!endPoint) {
      cb();
      return;
    }
    var req = navigator.push.unregister(endPoint);
    req.onsuccess = function() {
      console.log('End point unregistered ok!', endPoint);
      var url = GALLERY_SERVER_UNREGISTER + '?access_token=' + access_token +
        '&push_token=' + endPoint;
      Rest.get(url, {
        success: function() {
          console.log('Successfully unregistered on the server: ');
          window.asyncStorage.removeItem('pushToken', function() {
            console.log('Push token removed correctly');
          });
          cb();
        },
        error: function() {
          console.error('Error while unregistering the push endpoint',
                        req.error.name);
          cb(req.error);
        }
      }, {
            operationsTimeout: 10000,
            method: 'POST'
      });
    };

    req.onerror = function() {
      console.error('Error while unregistering the push ', req.error.name);
    };
  });
}

function setHandlers() {
  navigator.mozSetMessageHandler('activity', handleActivity);
  navigator.mozSetMessageHandler('push', handlePush);

  navigator.mozSetMessageHandler('notification', function() {
    window.console.log('Notification called');
    navigator.mozApps.getSelf().onsuccess = function(evt) {
      var app = evt.target.result;
      app.launch();
    };
  });
}

var state;

if (navigator.mozHasPendingMessage('activity')) {
  navigator.mozSetMessageHandler('activity', handleActivity);
}
else if (!navigator.mozHasPendingMessage('push')) {
  window.console.log('Showing the app');
  state = 'running';
  setHandlers();
  togglePick();
  Gallery.start();
}
else {
  state = 'mustClose';
  navigator.mozSetMessageHandler('push', handlePush);
}


function handlePush(e) {
  window.console.log(state, e);
  console.log('Push message received. Version: ', e.version);
   var notif = new Notification('Cloud Gallery', {
    body: 'Gallery has changed'
  });

  if (state === 'running') {
    togglePick();
    Gallery.newVersion(e.version);
  }
  else {
    window.close();
  }

}


var PRIVATE_GALLERY_SERVICE = 'http://5.255.150.180/upload_media';

function toggleUpload() {
  document.querySelector('#upload').classList.remove('hide');
  document.querySelector('#gallery-list').classList.add('hide');
  document.querySelector('section.empty').style.opacity = 0;
}

function togglePick() {
  document.querySelector('#upload').classList.add('hide');
  document.querySelector('#gallery-list').classList.remove('hide');
  document.querySelector('section.empty').style.opacity = 0;
}

function handleActivity(activityRequest) {
  inActivity = true;
  activity = activityRequest;

  window.console.log('In handle activity ...');

  window.asyncStorage.getItem('userData', function(data) {
    if (!data) {
      oauth.flow.start(function(token) {
        window.asyncStorage.setItem('userData', token, function() {
          window.console.log('Token stored!!!');
          registerPush(token);
        });

        doHandleActivity(activityRequest, token);
      });
    }
    else {
      window.console.log('Token already available: ', data);
      doHandleActivity(activityRequest, data);
    }
  });
}

function doHandleActivity(activityRequest, access_token) {
  var options = activityRequest.source;

  if (activityRequest.source.name === 'pick') {
    togglePick();
    Gallery.start();
    return;
  }

  if (options.name === 'share') {
    window.console.log('Handling share activity ...');
    toggleUpload();
    uploadContent(options.data.blobs[0], access_token, function(newMediaId) {
      togglePick();
      Gallery.refresh(newMediaId);
      activityRequest.postResult({
        success: true
      });
      inActivity = false;
    });
  }
}

function uploadContent(blob, access_token, done) {
  var blobUrl = window.URL.createObjectURL(blob);
  var fileName = blobUrl.substring(blobUrl.indexOf(':') + 1);
  var url = PRIVATE_GALLERY_SERVICE + '?access_token=' + access_token +
  '&' + 'file_name=' + encodeURIComponent(fileName);

  var img = new Image();
  img.src = blobUrl;
  window.console.log('Hereeeee', blobUrl);

  img.onload = function onBlobLoad() {
    window.console.log('Image on load');
    window.URL.revokeObjectURL(blobUrl);
    var width = img.naturalWidth;
    var height = img.naturalHeight;

    var targetValue = Math.min(width, height);
    var relationship = 106 / targetValue;

    // Make the image square
    var canvas1 = document.createElement('canvas');
    canvas1.width = width * relationship;
    canvas1.height = height * relationship;

    var context1 = canvas1.getContext('2d');
    context1.drawImage(img, 0, 0, canvas1.width, canvas1.height);

    var canvas = document.createElement('canvas');
    var targetWidth = canvas.width = canvas.height = 106;

    var context = canvas.getContext('2d');
    context.drawImage(canvas1, (canvas1.width - targetWidth) / 2,
                  (canvas1.height - targetWidth) / 2, targetWidth, targetWidth,
                  0, 0, targetWidth, targetWidth);
    console.log('Image drawn to canvas');

    canvas.toBlob(function(thumbnail) {
      var uploader = new MediaUploader(url, blob, thumbnail);

      uploader.onfinish = function() {
        window.console.log('Uploaded correctly !!!');
        var notif = new Notification('Cloud Gallery', {
          body: 'Photo has been uploaded'
        });
        done(fileName);
      };

      uploader.onerror = function(e) {
        window.console.error('Error while uploading!!!', e);
      };

      uploader.onprogress = function() {
        window.console.info('Progress ... !');
      };

      uploader.start();
    });
  };
}
