'use strict';

function MediaUploader(url, content, thumbnail) {
  var self = this;
  var isInError = false;

  this.start = function() {
    doUpload(url, content, thumbnail);
  };

  function doUpload(url, data, thumbnail) {
    var xhr = new XMLHttpRequest({
      mozSystem: true
    });

    xhr.open('POST', url, true);

    xhr.upload.addEventListener('progress', function(e) {
      if (e.lengthComputable) {
        var percentage = Math.round(e.loaded / (e.total / 100));
        if (typeof self.onprogress === 'function') {
          self.onprogress(percentage);
        }
      }
    });

    xhr.upload.addEventListener('load', function(e) {
      if (typeof self.onupload === 'function') {
        self.onupload();
      }
    });

    xhr.upload.addEventListener('error', function(e) {
      isInError = true;
      if (typeof self.onerror === 'function') {
        self.onerror(e);
      }
    });

    xhr.onreadystatechange = function() {
      if (xhr.readyState == XMLHttpRequest.DONE) {
        // var response = JSON.parse(xhr.responseText);
        if (!isInError && typeof self.onfinish === 'function') {
          self.onfinish();
        }
      }
    };

    var formData = new FormData();
    formData.append('media', data);
    formData.append('thumbnail', thumbnail);

    xhr.send(formData);
  };
}
