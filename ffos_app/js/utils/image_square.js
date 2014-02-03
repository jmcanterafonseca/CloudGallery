'use strict';

var utils = window.utils || {};

if (typeof utils.squareImage === 'undefined') {
  utils.squareImage = function(blob, callback) {
    var img = new Image();
    var url = URL.createObjectURL(blob);
    img.src = url;
    img.onload = function onBlobLoad() {
      URL.revokeObjectURL(url);
      var width = img.width;
      var height = img.height;

      if (width === height) {
        callback(blob);
      } else {
        var canvas = document.createElement('canvas');
        var min = canvas.width = canvas.height = Math.min(width, height);
        var context = canvas.getContext('2d');
        context.drawImage(img, (width - min) / 2, (height - min) / 2, min, min,
                          0, 0, min, min);
        canvas.toBlob(callback);
      }
    };
  }; // utils.squareImage
} // if
