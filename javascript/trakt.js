function Trakt()
{
	this.initialize();
}

Trakt.prototype =
{
	initialize: function()
	{
		this.user = ""; // Trakt.tv username
		this.apikey = ""; // http://trakt.tv/api-docs/authentication
		this.getTVLibrary();
	},

	getTVLibrary: function()
	{
		var query = "http://api.trakt.tv/user/library/shows/all.json/" + this.apikey + "/" + this.user + "?callback=?";

		this.rawLibrary = $.getJSON(query);
	}
};