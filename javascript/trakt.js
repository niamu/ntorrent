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
			trakt.getTraktData();
			trakt.renderUser();
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
			this.verifyUser = $.getJSON(query).done(function(result) {
				if (result.username){
					trakt.user = result;
					trakt.user.api = login.api;
					trakt.user.showTracker = login.showTracker;
					trakt.user.movieTracker = login.movieTracker;
					localStorage.setItem('trakt',JSON.stringify(trakt.user));
				}
			});
		}
	},

	getTraktData: function()
	{
		var urls = [];
		urls.push("http://api.trakt.tv/user/library/shows/all.json/" + trakt.user.api + "/" + trakt.user.username + "?callback=?");
		urls.push("http://api.trakt.tv/user/library/movies/all.json/" + trakt.user.api + "/" + trakt.user.username + "?callback=?");
		if (!sessionStorage.getItem("shows") && !sessionStorage.getItem("movies")){
			trakt.data = [];
			var result = 0;
			$.each(urls, function (i, url) {
			    trakt.data.push(
			        $.getJSON(url, function (json) {
			        	var datatype = url.match(/\/library\/([^\/]+)/)[1];
			        	if (datatype == "shows")
			        		trakt.shows = json;
			        	else
			        		trakt.movies = json;
						sessionStorage.setItem(datatype, JSON.stringify(json));
			        })
			    );
			});
		}else{
    		trakt.shows = JSON.parse(sessionStorage.getItem("shows"));
    		trakt.movies = JSON.parse(sessionStorage.getItem("movies"));
		}
	},

	injectTorrent: function(torrent)
	{
		var mediaType = torrent.getMediaType();
		var data = trakt.matchTorrent(torrent.fields.name,mediaType);

		if (mediaType == "shows"){
			function pad(n) {
				if (n <= 0)
			    	return (n < 10) ? ("0" + n) : n;
			    else
			    	return n;
			}
			var productionCode = torrent.fields.name.replace(/[12][0-9]{3}\./g,"").match(/[sS]?[0-9]*[eE|xX]?[0-9]{2}/)[0].replace(/[^0123456789]/g,"");

			if (productionCode.length > 2)
				var episode = "E" + productionCode.substr(-2);
			else
				var episode = "";
			var season = "S" + pad(productionCode.replace(episode.replace(/[^0123456789]/g,""),""));
			torrent.setField(torrent.fields,"production_code",season + episode);
		}

		torrent.setField(torrent.fields,"trakt",data);
		torrent.refresh(data);
	},

	injectTraktEpisodeData: function(data) {
		episodeData = trakt.getEpisode(data);

		trakt.rawEpisode.done(function(result) {
			if (episodeData.episode < 10){
				episodeData.episode = "0" + episodeData.episode;
			}
			torrent.setField(data,"episode_name",result.episode.title + " " + episodeData.season + "x" + episodeData.episode);
			torrent.setField(data,"series_name",result.show.title);
			torrent.setField(data,"background",result.show.images.poster.substring(0,result.show.images.poster.length - 4) + "-300.jpg");
			torrent.refresh(data);
		});
	},

	matchTorrent: function(torrentName,mediaType)
	{
		var clean_name = torrentName.replace(/[\._\;]/g," ").replace(/[\:\(\)]/g,"").toLowerCase();

		if (mediaType == "shows")
			var library = trakt.shows;
		else
			var library = trakt.movies;

		for (var i = 0; i < library.length; i++) {
			var show = library[i].title.replace(/[\:\(\)]/g,"").replace(/[\;]/g," ").replace(/[\+]/g,"plus").toLowerCase();

			var re = new RegExp(show);
			if (clean_name.match(re)){
				return library[i];
			}
		}
	},

	getEpisode: function(torrent)
	{
		var clean_name = torrent.fields.name;

		for (var i = 0; i < this.library.length; i++) {
			var show = this.library[i].title.replace(/[\:\(\)]/g,"").replace(/[\;]/g," ").replace(/[\+]/g,"plus").toLowerCase();

			var re = new RegExp(show);
			if (clean_name.match(re)){
				var title = show.toLowerCase().replace(/[ ]/g,"-");
				try{
					var production_code = clean_name.match(/[0-9]{2}[eE|xX][0-9]{2}/)[0];
				}
				catch(err){
					var production_code = clean_name.match(/[sS][0-9]{2}/)[0];
				}
				var season = parseInt(production_code.match(/[0-9]*/)[0], 10).toString();
				try{
					var episode = parseInt(production_code.match(/[eE|xX][0-9]*/)[0].substring(1), 10).toString();
				}
				catch(err){
					var episode = null;
				}

				var summary = [];

				var query = "http://api.trakt.tv/show/episode/summary.json/" + trakt.user.api + "/" + title + "/" + season + "/" + episode + "?callback=?";
				this.rawEpisode = $.getJSON(query)

				return {
					title: this.library[i].title,
					season: season,
					episode: episode
				};
			}
		}
	}
};