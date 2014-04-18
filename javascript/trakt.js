function Trakt()
{
	this.initialize();
}

Trakt.prototype =
{
	initialize: function()
	{
		trakt = this;

		function init(e) {
			if (e){
				e.preventDefault();
				trakt.verifyLogin($('#login_form').serializeObject());
			}
			if (trakt.user){
				trakt.getFriends();
				trakt.getTraktData();
				trakt.renderUser();
			}
			$("#login").remove();
		}

		$('#login_form').submit(init);
		trakt.user = JSON.parse(localStorage.getItem('trakt'))
		if (trakt.user)
			init();
	},

	renderUser: function()
	{
		var user = $("#user");
		var avatar = document.createElement('img');
		avatar.className = 'user-avatar';
		avatar.src = trakt.user.avatar;
		var name = document.createElement('h3');
		name.className = 'user-name';
		setTextContent(name,trakt.user.full_name);
		user.append(avatar);
		user.append(name);
	},

	verifyLogin: function(login)
	{
		if (login){
			var query = "http://api.trakt.tv/user/profile.json/" + login.api + "/" + login.name + "?callback=?";
			$.getJSON(query).done(function(result) {
				if (result.username){
					trakt.user = result;
					trakt.user.api = login.api;
					trakt.user.showTracker = login.showTracker.toLowerCase().replace(', ',',').split(',');
					trakt.user.movieTracker = login.movieTracker.toLowerCase().replace(', ',',').split(',');
					localStorage.setItem('trakt',JSON.stringify(trakt.user));
					trakt.getFriends();
					trakt.getTraktData();
					trakt.renderUser();
				}
			});
		}
	},

	getFriends: function()
	{
		var friends = [];
		var query = "http://api.trakt.tv/user/network/friends.json/" + trakt.user.api + "/" + trakt.user.username + "?callback=?";
		$.getJSON(query, function (result) {
			result.forEach (function(friend){
				if (!friend.protected){
					var urls = [];
					urls.push("http://api.trakt.tv/user/library/shows/all.json/" + trakt.user.api + "/" + friend.username + "?callback=?");
					urls.push("http://api.trakt.tv/user/library/movies/all.json/" + trakt.user.api + "/" + friend.username + "?callback=?");
					$.each(urls, function (i, url) {
						var datatype = url.match(/\/[l|w].+\/(movies|shows)/)[1];
						var shows = [], movies = [];
						$.getJSON(url, function (json) {
							if (datatype == "shows")
								shows.push(json);
							else
								movies.push(json);
						}).done(function() {
							if (shows.length == 1){
								friend.shows = shows[0];
							}
							if (movies.length == 1){
								friend.movies = movies[0];
							}
						});
					});
				}
				friends.push(friend);
			});
		}).done(function(){
			trakt.user.friends = friends;
			sessionStorage.setItem('trakt', JSON.stringify(trakt.user));
		});
	},

	getTraktData: function()
	{
		var urls = [];
		urls.push("http://api.trakt.tv/user/library/shows/all.json/" + trakt.user.api + "/" + trakt.user.username + "?callback=?");
		urls.push("http://api.trakt.tv/user/library/movies/all.json/" + trakt.user.api + "/" + trakt.user.username + "?callback=?");
		urls.push("http://api.trakt.tv/user/watchlist/shows.json/" + trakt.user.api + "/" + trakt.user.username + "?callback=?");
		urls.push("http://api.trakt.tv/user/watchlist/movies.json/" + trakt.user.api + "/" + trakt.user.username + "?callback=?");
		trakt.shows = JSON.parse(sessionStorage.getItem("shows"));
		trakt.movies = JSON.parse(sessionStorage.getItem("movies"));
		if (!trakt.shows || !trakt.movies){
			trakt.data = [];
			var shows = [],movies = [];
			$.each(urls, function (i, url) {
				var datatype = url.match(/\/[l|w].+\/(movies|shows)/)[1];
				trakt.data.push(
					$.getJSON(url, function (json) {
						if (datatype == "shows")
							shows.push(json);
						else
							movies.push(json);
					}).done(function() {
						if (shows.length == 2){
							trakt.shows = shows[0].concat(shows[1]);
							sessionStorage.setItem(datatype, JSON.stringify(trakt.shows));
						}
						if (movies.length == 2){
							trakt.movies = movies[0].concat(movies[1]);
							sessionStorage.setItem(datatype, JSON.stringify(trakt.movies));
						}
					})
				);
			});
		}
		$.when.apply($, trakt.data).done(function() {
			transmission = new Transmission(); // Initialise the main Transmission controller
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
		var data = trakt.matchTorrent(torrent.fields.name,mediaType);

		if (mediaType == "shows"){
			torrent.setField(torrent.fields,"production_code",trakt.productionCode(torrent.fields.name));
		}

		torrent.setField(torrent.fields,"trakt",data);
		torrent.refresh(data);
	},

	matchTorrent: function(torrentName,mediaType)
	{
		var clean_name = torrentName.replace(/[\._\;]/g," ").replace(/[\:\(\)\']/g,"").toLowerCase();

		if (mediaType == "shows")
			var library = trakt.shows;
		else
			var library = trakt.movies;

		for (var i = library.length - 1; i >= 0; i--) {
			var title = library[i].title.replace(/[\:\(\)\'\.]/g,"").replace(/[\;]/g," ").replace(/[\+]/g,"plus").toLowerCase();

			var re = new RegExp("^"+title);
			if (clean_name.match(re)){
				return library[i];
			}
		}
	}
};