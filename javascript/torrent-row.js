/**
 * Copyright © Mnemosyne LLC
 *
 * This file is licensed under the GPLv2.
 * http://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 */

function TorrentRendererHelper()
{
}

TorrentRendererHelper.getProgressInfo = function(controller, t)
{
	var pct, extra,
	    s = t.getStatus(),
	    seed_ratio_limit = t.seedRatioLimit(controller);

	if (!t.isDone())
		pct = Math.round(t.getPercentDone() * 100);
	else if (seed_ratio_limit > 0 && t.isSeeding()) // don't split up the bar if paused or queued
		pct = Math.round(t.getUploadRatio() * 100 / seed_ratio_limit);
	else
		pct = 100;

	if (s === Torrent._StatusStopped)
		extra = 'paused';
	else if (s === Torrent._StatusDownloadWait)
		extra = 'leeching queued';
	else if (s === Torrent._StatusDownload)
		extra = 'leeching';
	else if (s === Torrent._StatusSeedWait)
		extra = 'seeding queued';
	else if (s === Torrent._StatusSeed)
		extra = 'seeding';
	else
		extra = '';

	return {
		percent: pct,
		complete: [ 'torrent_progress_bar', 'complete', extra ].join(' '),
		incomplete: [ 'torrent_progress_bar', 'incomplete', extra ].join(' ')
	};
};

TorrentRendererHelper.createProgressbar = function(classes)
{
	var complete, incomplete, progressbar;

	complete = document.createElement('div');
	complete.className = 'torrent_progress_bar complete';

	incomplete = document.createElement('div');
	incomplete.className = 'torrent_progress_bar incomplete';

	progressbar = document.createElement('div');
	progressbar.className = 'torrent_progress_bar_container';
	progressbar.appendChild(complete);
	progressbar.appendChild(incomplete);

	return { 'element': progressbar, 'complete': complete, 'incomplete': incomplete };
};

TorrentRendererHelper.renderProgressbar = function(controller, t, progressbar)
{
	var e, style, width, display,
	    info = TorrentRendererHelper.getProgressInfo(controller, t);

	// update the complete progressbar
	e = progressbar.complete;
	style = e.style;
	width = '' + info.percent + '%';
	display = info.percent > 0 ? 'block' : 'none';
	if (style.width!==width || style.display!==display)
		$(e).css({ width: ''+info.percent+'%', display: display });
	if (e.className !== info.complete)
		e.className = info.complete;

	// update the incomplete progressbar
	e = progressbar.incomplete;
	display = (info.percent < 100) ? 'block' : 'none';
	if (e.style.display !== display)
		e.style.display = display;
	if (e.className !== info.incomplete)
		e.className = info.incomplete;
};

TorrentRendererHelper.formatUL = function(t)
{
	return Transmission.fmt.speedBps(t.getUploadSpeed());
};

TorrentRendererHelper.formatDL = function(t)
{
	return Transmission.fmt.speedBps(t.getDownloadSpeed());
};

/****
*****
*****
****/

function TorrentRendererFull()
{
}
TorrentRendererFull.prototype =
{
	createRow: function()
	{
		var root, name, peers, eta, progressbar, details, image, button;

		root = document.createElement('li');
		root.className = 'torrent';

		name = document.createElement('div');
		name.className = 'torrent_name';

		meta = document.createElement('div');
		meta.className = 'torrent_meta';

		peers = document.createElement('div');
		peers.className = 'torrent_peer_details';

		progressbar = TorrentRendererHelper.createProgressbar('full');

		details = document.createElement('div');
		details.className = 'torrent_progress_details';

		eta = document.createElement('div');
		eta.className = 'torrent_progress_eta';

		image = document.createElement('div');
		button = document.createElement('a');
		button.appendChild(image);

		root.appendChild(details);
		root.appendChild(progressbar.element);
		root.appendChild(meta);
		meta.appendChild(name);
		meta.appendChild(eta);
		//root.appendChild(peers);
		root.appendChild(button);

		root._name_container = name;
		root._peer_details_container = peers;
		root._progress_eta_container = eta;
		root._progress_details_container = details;
		root._progressbar = progressbar;
		root._pause_resume_button_image = image;
		root._toggle_running_button = button;

		return root;
	},

	getProgressDetails: function(controller, t)
	{
		var c,
		    is_done = t.isDone() || t.isSeeding();

		c = [ "paused" ]; 

		if (!t.isStopped() && is_done) {
			if (TorrentRendererHelper.formatUL(t) != 0):
				c = [ TorrentRendererHelper.formatUL(t) ];
		}else if (!t.isStopped() && !is_done) { // not done yet
			if (TorrentRendererHelper.formatDL(t) != 0):
				c = [ TorrentRendererHelper.formatDL(t) ];
		}

		return c;
	},

	getProgressEta: function(controller, t)
	{
		var c,
		is_done = t.isDone() || t.isSeeding();

		if (!t.isStopped() && (!is_done || t.seedRatioLimit(controller)>0)) {
			var eta = t.getETA();
			if (eta < 0 || eta >= (999*60*60))
				c = [ '' ];
			else
				c = [ Transmission.fmt.timeInterval(t.getETA()) ];
		}else{
			c = [ '' ];
		}

		return c;
	},

	render: function(controller, t, root)
	{
		// name
		setTextContent(root._name_container, t.getName());

		var e = root;
		$(e).css('background-image', 'url(' + t.getBackground() + ')');

		//trackers
		var trackers = t.getTrackers();
		for (var j=0, tracker; tracker=trackers[j]; ++j)
		{
			var announce = tracker.announce;
			var uri = parseUri(announce);

			uri.domain = transmission.getDomainName (uri.host);
			//root.className = "torrent " + uri.domain;
		}

		// progressbar
		TorrentRendererHelper.renderProgressbar(controller, t, root._progressbar);

		// peer details
		var has_error = t.getError() !== Torrent._ErrNone;
		var e = root._peer_details_container;
		$(e).toggleClass('error',has_error);

		// progress details
		e = root._progress_details_container;
		var progress_percent = this.getProgressDetails(controller, t).toString();
		if (progress_percent == "paused"){
			setInnerHTML(e, "<span class=\"paused\">" + this.getProgressDetails(controller, t) + "</span>");
		}else{
			setInnerHTML(e, "<span>" + this.getProgressDetails(controller, t) + "</span>");
		}

		// progress eta
		e = root._progress_eta_container;
		setTextContent(e, this.getProgressEta(controller, t));		

		// pause/resume button
		var is_stopped = t.isStopped();
		e = root._pause_resume_button_image;
		e.alt = is_stopped ? 'Resume' : 'Pause';
		e.className = is_stopped ? 'torrent_resume' : 'torrent_pause';
	}
};

function TorrentRow(view, controller, torrent)
{
	this.initialize(view, controller, torrent);
}
TorrentRow.prototype =
{
	initialize: function(view, controller, torrent) {
		var row = this;
		this._view = view;
		this._torrent = torrent;
		this._element = view.createRow();
		this.render(controller);
		$(this._torrent).bind('dataChanged.torrentRowListener',function(){row.render(controller);});

	},
	getElement: function() {
		return this._element;
	},
	render: function(controller) {
		var tor = this.getTorrent();
		if (tor)
			this._view.render(controller, tor, this.getElement());
	},
	isSelected: function() {
		return this.getElement().className.indexOf('selected') !== -1;
	},

	getTorrent: function() {
		return this._torrent;
	},
	getTorrentId: function() {
		return this.getTorrent().getId();
	}
};
