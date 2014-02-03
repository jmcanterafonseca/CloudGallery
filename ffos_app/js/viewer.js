'use strict';

var Gallery = (function() {
  var GALLERY_SERVER = 'http://5.255.150.180';
  var LIST_MEDIA_URI = GALLERY_SERVER + '/' + 'list_media_fast';
  var MEDIA_URI = GALLERY_SERVER + '/' + 'media';
  var ALBUMS_URI = GALLERY_SERVER + '/' + 'list_albums';

  var list = document.querySelector('ul.gallery');
  var backButton = document.getElementById('back');
  var gallerySection = document.querySelector('#gallery-list');
  var mediaDetail = document.querySelector('#gallery-detail');
  var progressActivity = mediaDetail.querySelector('progress');
  var progressActivityList = gallerySection.querySelector('progress');
  var currentMediaId;
  var rendered = false;
  var rendering = false;
  var widthPerItem;

  var imgNode = null;
  var imgContainer = document.querySelector('#img-container');

  var numImgsLoaded = 0;
  var totalMedia = 0;

  var access_token;

  function tokenReady(cb, token) {
    access_token = token;
    cb(token);
  }

  function getToken(cb, errorCb) {
    window.asyncStorage.getItem('userData', function(data) {
      if (!data) {
        oauth.flow.start(function(token) {
          window.asyncStorage.setItem('userData', token, function() {
            console.log('Token stored correctly');
            registerPush(token);
          });
          tokenReady(cb, token);
        });
        return;
      }
      tokenReady(cb, data);
    }, errorCb);
  }

  function listMedia(access_token, cb, errorCb) {
    Rest.get(LIST_MEDIA_URI + '?access_token=' + access_token, {
      success: function(response) {
        cb(response.data);
      },
      error: errorCb,
      timeout: function() {
        alert('Timeout');
        progressActivityList.style.display = 'none';
      }
    }, {
        operationsTimeout: 10000
    });
  }

  function onLoadImg() {
    numImgsLoaded++;
    if (numImgsLoaded === totalMedia) {
      removeProgressActivity('#gallery-list');
    }
  }

  function removeProgressActivity(section) {
    var sct = document.querySelector(section);
    var progress = sct.querySelector('progress');
    progress.style.display = 'none';
  }

  function buildImageNode(access_token, src) {
    var li = document.createElement('li');
    li.dataset.media = src;
    li.style.width = widthPerItem + 'px';
    li.style.height = widthPerItem + 'px';
    var img = document.createElement('img');
    img.onload = onLoadImg;
    img.onerror = onLoadImg;
    li.appendChild(img);
    img.src = MEDIA_URI + '/' + src + '?access_token=' + access_token +
    '&th=1';

    return li;
  }

  function renderGallery(access_token, done) {
    listMedia(access_token, function(mediaList) {
      totalMedia = mediaList.length;
      if (totalMedia === 0) {
        progressActivityList.style.display = 'none';
      }
      mediaList.forEach(function(aMedia) {
        list.appendChild(buildImageNode(access_token, aMedia));
      });
      done();
    }, function error() {
        console.error('Error while listing media');
    });
  }

  function goBack() {
    mediaDetail.addEventListener('transitionend', function tend() {
      mediaDetail.removeEventListener('transitionend', tend);
      mediaDetail.classList.remove('right-to-left');
      mediaDetail.classList.remove('back-to-right');
      mediaDetail.classList.add('hidden');
      if (imgNode) {
        imgContainer.removeChild(imgNode);
      }
    });

    mediaDetail.classList.add('back-to-right');
  }

  function orientationChanged() {
    var newOrientation = screen.mozOrientation;
    window.setTimeout(function() {
      if (newOrientation.startsWith('landscape')) {
        widthPerItem = window.innerWidth / 5 - 3;
      }
      else {
        widthPerItem = window.innerWidth / 3 - 3;
      }
      var allListItems = list.querySelectorAll('li');
      for(var j = 0; j < allListItems.length; j++) {
        allListItems.item(j).style.width = widthPerItem + 'px';
        allListItems.item(j).style.height = widthPerItem + 'px';
      }
    }, 50);
    // Let's check if we are on the show media screen
    if (!mediaDetail.classList.contains('hidden')) {
      // Avoiding race condition in calculating values
      window.setTimeout(setImageDimensions, 50,
                        document.querySelector('#theImage'));
    }
  }

  function setImageDimensions(imgNode) {
    window.console.log('Dimensions: ' + window.innerWidth + window.innerHeight);
    var availableHeight = window.innerHeight -
              mediaDetail.querySelector('header').clientHeight -
              mediaDetail.querySelector('div[role="toolbar"]').clientHeight;
    window.console.log('Available height: ' + availableHeight);

    var relX = window.innerWidth / imgNode.naturalWidth;
    var relY = availableHeight / imgNode.naturalHeight;

    var minRel = Math.min(relX, relY);
    imgNode.width = imgNode.naturalWidth * minRel;
    window.console.log('Img Node Width: ' + imgNode.width);
    imgNode.height = imgNode.naturalHeight * minRel;
    window.console.log('Img Node Height: ' + imgNode.height);

    if (imgNode.height < availableHeight) {
      imgNode.style.top = (availableHeight - imgNode.height) / 2 + 'px';
    }
    else {
      imgNode.style.top = '0px';
    }
  }

  function showMedia(e) {
    var target = e.target;
    var media = target.dataset.media;

    if (inActivity === true) {
      progressActivityList.style.display = '';
      Rest.get(getMediaUrl(media), {
        success: function(result) {
          progressActivityList.style.display = 'none';
          activity.postResult({
            blob: result,
            type: result.type
          });
        },
        error: function(err) {
          activity.postError('UnknownError');
          progressActivityList.style.display = 'none';
          console.error('Error while downloading photo pick', err);
        },
        timeout: function() {
          progressActivityList.style.display = 'none';
          activity.postError('TimeoutError');
        }
      },{
          operationsTimeout: 10000,
          responseType: 'blob'
      });

      inActivity = false;
      return;
    }

    mediaDetail.classList.add('right-to-left');
    mediaDetail.classList.remove('hidden');

    progressActivity.style.display = '';

    currentMediaId = media;

    Rest.get(getMediaUrl(media), {
      success: function(blob) {
        imgNode = new Image();
        imgNode.id = 'theImage';
        imgNode.src = window.URL.createObjectURL(blob);

        imgNode.onload = function() {
          setImageDimensions(imgNode);
          progressActivity.style.display = 'none';
          imgContainer.appendChild(imgNode);
        };
      },
      error: function() {
        alert('Error');
      },
      timeout: function() {
        alert('Timeout');
      }
    },{
        responseType: 'blob',
        operationsTimeout: 20000
    });
  }

  function getMediaUrl(media) {
    return MEDIA_URI + '/' + media + '?access_token=' + access_token;
  }

  function deleteMedia(e) {
    ConfirmDialog.show('Media Gallery',
                       'Are you sure you want do delete this media?', {
                          title: 'Cancel',
                          isDanger: false,
                          callback: function() {
                            ConfirmDialog.hide();
                          }
                        },
                        {
                          title: 'Delete',
                          isDanger: true,
                          callback: function() {
                            doDeleteMedia();
                            ConfirmDialog.hide();
                          }
                        }
    );

  }

  function doDeleteMedia() {
    progressActivity.style.display = '';
    var mediaId = currentMediaId;
    imgNode.style.opacity = 0.2;
    Rest.get(getMediaUrl(mediaId), {
      success: mediaRemoved,
      error: function() {
        alert('Error');
        console.error('Error while deleting media');
        progressActivity.style.display = 'none';
      },
      timeout: function() {
        alert('Timeout');
        progressActivity.style.display = 'none';
      }
    },{
        operationsTimeout: 10000,
        method: 'DELETE'
    });
  }

  function mediaRemoved() {
    var ele = document.querySelector('li[data-media="' + currentMediaId + '"]');
    list.removeChild(ele);
    currentMediaId = null;
    progressActivity.style.display = 'none';
    imgNode.style.opacity = 1;
    alert('Media Removed!');
    goBack();
  }

  function pickImage(cb) {
    var activityOptions = {
      name: 'pick',
      data: {
        type: 'image/*',
        self: 'self'
      }
    };

    var activity = new MozActivity(activityOptions);
    activity.onsuccess = function() {
      var blob = activity.result.blob;
      cb(blob);
    };
    activity.onerror = function() {
      window.console.error('Error: ', activity.error);
      cb(null);
    };
  }

  function addMedia() {
    pickImage(function imgReady(blob) {
      window.console.log('Image Ready after picking');
      if (blob) {
        toggleUpload();
        uploadContent(blob, access_token, function(uploadedId) {
          togglePick();
          prependNewMedia(uploadedId);
        });
      }
    });
  }

  function prependNewMedia(newMediaId) {
    var beforeEle = list.firstElementChild;
    window.console.log('Before: ', beforeEle);
    list.insertBefore(buildImageNode(access_token, newMediaId), beforeEle);
  }

  function logout() {
    progressActivityList.style.display = '';

    // var REDIRECT_LOGOUT_URI = GALLERY_SERVER + '/' + 'logout_redirect';
    var REDIRECT_LOGOUT_URI =
                      'https://www.facebook.com/connect/login_success.html';
    var logoutService = 'https://www.facebook.com/logout.php?';
    var params = [
      'next' + '=' + encodeURIComponent(REDIRECT_LOGOUT_URI),
      'access_token' + '=' + access_token
    ];

    var logoutParams = params.join('&');
    var logoutUrl = logoutService + logoutParams;
    window.console.log(logoutUrl);
/*
    window.addEventListener('message', function logoutHandler(e) {
      window.removeEventListener('message', logoutHandler);
      if (e.type === 'ok') {
        window.console.log(result);
        window.console.log('Logout service invoked successfully');
        window.asyncStorage.removeItem('userData', function() {
          unregisterPush(access_token, function() {
            window.setTimeout(function() {
              progressActivity.style.display = 'none';
              clearGallery();
              Gallery.start();
            }, 1500);
          });
        });
      }
    });

    window.open(logoutUrl); */

    Rest.get(logoutUrl, {
      success: function(result) {
        window.console.log(result);
        window.console.log('Logout service invoked successfully');
        window.asyncStorage.removeItem('userData', function() {
          unregisterPush(access_token, function() {
            window.setTimeout(function() {
              progressActivity.style.display = 'none';
              clearGallery();
              Gallery.start();
            }, 1500);
          });
        });
      },
      error: function() {
        alert('Error');
        progressActivity.style.display = 'none';
        console.log('Error while logging out');
      },
      timeout: function() {
        progressActivity.style.display = 'none';
        alert('Operation timeout');
      }
    },{
        operationsTimeout: 20000
    });
  }

  function reload() {
    clearGallery();
    start();
  }

  function newVersion(versionNumber) {
    reload();
  }

  function clearGallery() {
    rendering = false;
    rendered = false;
    list.innerHTML = '';
  }

  function sendMedia() {
    var uri = ALBUMS_URI + '?access_token=' + access_token;
    progressActivity.style.display = '';
    Rest.get(uri, {
      success: function(result) {
        var actionMenuOptions = {
          id: 'albums',
          title: 'Choose a Facebook Album',
          actions: []
        };
        result.forEach(function(aAlbum) {
          actionMenuOptions.actions.push({
            id: aAlbum.id,
            title: aAlbum.name
          });
        });
        actionMenuOptions.actions.push({
          id: 'cancel',
          title: 'Cancel'
        });

        var albumsElement = utils.ActionMenu.create(actionMenuOptions);
        document.body.appendChild(albumsElement);

        var albumsAction = utils.ActionMenu.bind(albumsElement);
        albumsAction.onclick = function(e) {
          if (e.target.id !== 'cancel') {
            doSendMediaFacebook(e.target.id, currentMediaId);
          }
        };
        progressActivity.style.display = 'none';
        albumsAction.show();
      },
      error: function() {
        alert('error');
      },
      timeout: function() {
        alert('timeout');
        progressActivity.style.display = 'none';
      }
    },{
        operationsTimeout: 10000
    });
  }

  function doSendMediaFacebook(albumId, mediaId) {
    var uri = GALLERY_SERVER + '/upload_media_facebook' + '/' +
    albumId + '/' + mediaId + '?access_token=' + access_token;

    progressActivity.style.display = '';
    imgNode.style.opacity = 0.2;

    Rest.get(uri, {
      success: function() {
        alert('Successfully pusblished to Facebook');
        progressActivity.style.display = 'none';
        imgNode.style.opacity = 1;
      },
      error: function() {
        alert('Error while publishing to Facebook');
        progressActivity.style.display = 'none';
        imgNode.style.opacity = 1;
      },
      timeout: function() {
        alert('Timeout while publishing to Facebook');
        progressActivity.style.display = 'none';
        imgNode.style.opacity = 1;
      }
    }, {
        method: 'POST',
        operationsTimeout: 20000
    });
  }

  function shareMedia() {
    progressActivity.style.display = '';
    Rest.get(getMediaUrl(currentMediaId), {
      success: function(result) {
        var activityOptions = {
          name: 'share',
          data: {
            type: 'image/*',
            blobs: [result],
            self: 'self',
            filenames: [currentMediaId]
          }
        };
        var activity = new MozActivity(activityOptions);
        activity.onsuccess = function() {
          progressActivity.style.display = 'none';
          window.console.log('File shared');
        };
        activity.onerror = function() {
          progressActivity.style.display = 'none';
          window.console.error('Error: ', activity.error);
        };
      },
      error: function(err) {
        alert('Error');
        progressActivity.style.display = 'none';
        console.error('Error while downloading photo pick', err);
      },
      timeout: function() {
        alert('Timeout');
        progressActivity.style.display = 'none';
      }
      },{
          operationsTimeout: 10000,
          responseType: 'blob'
      });
  }

  function start(cb) {
    if (rendered || rendering) {
      if (typeof cb === 'function') {
       cb(false);
      }
      return;
    }

    rendering = true;
    rendered = false;

    list.addEventListener('click', showMedia);
    backButton.addEventListener('click', goBack);
    document.querySelector('#delete').addEventListener('click', deleteMedia);
    document.querySelector('#send').addEventListener('click', sendMedia);
    document.querySelector('#add').addEventListener('click', addMedia);
    document.querySelector('#share').addEventListener('click', shareMedia);
    document.querySelector('#logout').addEventListener('click', logout);
    document.querySelector('#refresh').addEventListener('click', reload);

    widthPerItem = window.innerWidth / 3 - 3;

    screen.addEventListener('mozorientationchange', orientationChanged);

    numImgsLoaded = 0;
    totalMedia = 0;

    progressActivityList.style.display = '';
    getToken(function(access_token) {
      renderGallery(access_token, function() {
        console.log('Gallery rendered');
        rendered = true;
        rendering = false;
        if (typeof cb === 'function') {
          cb(true);
        }
      });
    }, function err() {
        console.log('There has been an error');
    });
  }

  function refresh(newMediaId) {
    start(function(refreshed) {
      if (!refreshed) {
        prependNewMedia(newMediaId);
      }
    });
  }

  return {
    'start': start,
    'refresh': refresh,
    'newVersion': newVersion
  };
})();
