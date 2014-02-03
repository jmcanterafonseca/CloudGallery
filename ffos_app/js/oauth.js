var oauth = {
  _APP_ID: '1384349841816348',
  _END_POINT: 'https://m.facebook.com/dialog/oauth/?',
  _REDIRECT_URI: 'http://5.255.150.180/redirection',
  _SCOPE: ['friends_about_me', 'user_photos', 'publish_stream'],
  _STATE: 'gallery',

  flow: {
    start: function(cb) {
      window.console.log('Starting flow ...');
      var redirect_uri = encodeURIComponent(oauth._REDIRECT_URI);

      var scope = oauth._SCOPE.join(',');
      var scopeParam = encodeURIComponent(scope);

      var queryParams = ['client_id=' + oauth._APP_ID,
                          'redirect_uri=' + redirect_uri,
                          'response_type=code',
                          'scope=' + scopeParam,
                          'state=' + oauth._STATE
      ]; // Query params

      var query = queryParams.join('&');
      var url = oauth._END_POINT + query;

      window.addEventListener('message', function msgListener(e) {
        if (e.data.type === 'token') {
          window.removeEventListener('message', msgListener);
          window.console.log('token ready: ', e.data.data);
          cb(e.data.data);
        }
      });

      window.open(url);
    }
  }
};
