function Trakt()
{
  this.initialize();
}

Trakt.prototype =
{
  initialize: function()
  {
    trakt = this;

    trakt.query('config.json',
      function(result){
        trakt.config = result;
        trakt.getSettings();
      });
  },

  getSettings: function()
  {
    if (!trakt.access_token && localStorage.getItem('access_token')){
      trakt.access_token = localStorage.getItem('access_token');
    }else{
      trakt.authenticate();
      return;
    }

    trakt.query('https://api-v2launch.trakt.tv/users/settings',
      function(result){
        trakt.user = result.user;
        trakt.start();
      });
  },

  start: function()
  {
    trakt.renderUser();
    trakt.getTraktData();
  },

  login: function()
  {
    var $login = $(
      "<div id='login'>" +
        "<p>Enter the <a href='http://trakt.tv/pin/" + trakt.config.pin + "'>PIN from Trakt</a> to authenticate.</p>" +
      "</div>");
    var $form = $(
      "<form>" +
        "<input type='text' placeholder='PIN'/>" +
        "<input type='submit' style='position: absolute; left: -9999px;' tabindex='-1' />" +
      "</form>");
    $form.submit(function(e){
      e.preventDefault();
      var pin = $( "input[type='text']", $form ).val();
      $("#torrent_container #login").remove();
      trakt.authenticate(pin);
    });
    $login.append($form);
    $("#torrent_container").prepend($login);
  },

  renderUser: function()
  {
    var user = $("#user");
    var avatar = document.createElement('img');
    avatar.className = 'user-avatar';
    avatar.src = trakt.user.images.avatar.full;
    var name = document.createElement('h3');
    name.className = 'user-name';
    setTextContent(name,trakt.user.name);
    user.append(avatar);
    user.append(name);
  },

  authenticate: function(pin)
  {
    var request = new XMLHttpRequest();

    request.open('POST', 'https://api-v2launch.trakt.tv/oauth/token');

    request.setRequestHeader('Content-Type', 'application/json');

    request.onreadystatechange = function () {
      if (this.readyState === 4) {
        var response = JSON.parse(this.responseText);
        if (this.status == 200){
          localStorage.setItem('access_token', response.access_token);
          localStorage.setItem('refresh_token', response.refresh_token);
          trakt.access_token = response.access_token;
          trakt.refresh_token = response.refresh_token;
          trakt.getSettings();
        }else{
          trakt.login();
        }
      }
    };

    var body = {
      'code': pin,
      'client_id': trakt.config.client_id,
      'client_secret': trakt.config.client_secret,
      'redirect_uri': trakt.config.redirect_uri,
      'grant_type': 'authorization_code'
    };

    request.send(JSON.stringify(body));
  },

  query: function(query, callback)
  {
    var request = new XMLHttpRequest();

    request.open('GET', query);

    if (query.indexOf("trakt.tv") >= 0){
      request.setRequestHeader('Content-Type', 'application/json');
      request.setRequestHeader('trakt-api-version', '2');
      request.setRequestHeader('trakt-api-key', trakt.config.client_id);
      request.setRequestHeader('Authorization', 'Bearer ' + trakt.access_token);
    }

    request.onreadystatechange = function () {
      if (this.readyState === 4) {
        if (this.status == 200){
          callback(JSON.parse(this.responseText));
        }else{
          console.error("Trakt query failed:", query, this.status);
        }
      }
    };

    request.send();
  },

  loaded: function()
  {
    trakt.shows = trakt.shows[0].concat(trakt.shows[1]);
    trakt.movies = trakt.movies[0].concat(trakt.movies[1]);
    transmission = new Transmission(); // Initialise the main Transmission controller
  },

  getTraktData: function()
  {
    var count = 0;
    trakt.shows = [];
    trakt.movies = [];
    trakt.query("https://api-v2launch.trakt.tv/users/" + trakt.user.username + "/watched/movies",
      function(result){
        trakt.movies.push(result);
        count = count + 1;
        if (count === 4) trakt.loaded();
      });
    trakt.query("https://api-v2launch.trakt.tv/users/" + trakt.user.username + "/watched/shows",
      function(result){
        trakt.shows.push(result);
        count = count + 1;
        if (count === 4) trakt.loaded();
      });
    trakt.query("https://api-v2launch.trakt.tv/users/" + trakt.user.username + "/watchlist/movies",
      function(result){
        trakt.movies.push(result);
        count = count + 1;
        if (count === 4) trakt.loaded();
      });
    trakt.query("https://api-v2launch.trakt.tv/users/" + trakt.user.username + "/watchlist/shows",
      function(result){
        trakt.shows.push(result);
        count = count + 1;
        if (count === 4) trakt.loaded();
      });
  },

  productionCode: function(name)
  {
    function pad(n) {
      if (n <= 0)
        return (n < 10) ? ("0" + n) : n;
      else
        return n;
    }
    if (name.match(/[sS]?[0-9]*[eE|xX]?[0-9]{2}/)){
      var productionCode = name.replace(/[12][0-9]{3}\./g,"").match(/[sS]?[0-9]*[eE|xX]?[0-9]{2}/)[0].replace(/[^0123456789]/g,"");

      if (productionCode.length > 2)
        var episode = "E" + productionCode.substr(-2);
      else
        var episode = "";
      var season = "S" + pad(productionCode.replace(episode.replace(/[^0123456789]/g,""),""));
      return season + episode;
    }else{
      return "SXXEXX";
    }
  },

  injectTorrent: function(torrent)
  {
    var mediaType = torrent.getMediaType();
    if (!mediaType) return; // can't match a torrent to a defined tracker

    var slug = trakt.matchTorrent(torrent,mediaType);
    if (!slug) return; // no slug means something went wrong and we can bail here

    trakt.query("https://api-v2launch.trakt.tv/" + mediaType + "/" + slug + "?extended=images",
      function(data){
        torrent.setField(torrent.fields,"trakt",data);
        torrent.refresh(data);
      });

    if (mediaType == "shows"){
      torrent.setField(torrent.fields,"production_code",trakt.productionCode(torrent.fields.name));
    }
  },

  matchTorrent: function(torrent,mediaType)
  {
    var torrentName = torrent.fields.name;
    var clean_name = torrentName.replace(/[\._\;]/g," ").replace(/[\:\(\)\']/g,"").toLowerCase();
    clean_name = clean_name.replace("space time odyssey", "spacetime odyssey");

    if (mediaType == "shows")
      var library = trakt.shows;
    else
      var library = trakt.movies;

    for (var i = library.length - 1; i >= 0; i--) {
      var media = mediaType.substring(0,mediaType.length-1);
      var title = library[i][media].title.replace(/[\:\(\)\']/g,"").replace(/\. /g," ").replace(/[\._\;]/g," ").replace(/[\+]/g,"plus").toLowerCase();
      var slug = library[i][media].ids.slug;

      var re = new RegExp("^"+title);
      if (clean_name.match(re)){
        return slug;
      }
    }
  }
};
