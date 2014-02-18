/**
 * Copyright © Jordan Lee, Dave Perrett, Malcolm Jarvis and Bruno Bierbaumer
 *
 * This file is licensed under the GPLv2.
 * http://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 */

function Transmission()
{
	this.initialize();
}

Transmission.prototype =
{
	/****
	*****
	*****  STARTUP
	*****
	****/

	initialize: function()
	{
		var e;

		// Initialize the helper classes
		this.remote = new TransmissionRemote(this);
		this.inspector = new Inspector(this, this.remote);

		// Initialize the implementation fields
		this.filterText    = '';
		this._torrents     = {};
		this._rows         = [];
		this.dirtyTorrents = {};
		this.uriCache      = {};

		// Initialize the clutch preferences
		Prefs.getClutchPrefs(this);

		// Set up user events
		$(".numberinput").forceNumeric();
		$('#toolbar-pause-all').click($.proxy(this.stopAllClicked,this));
		$('#toolbar-start-all').click($.proxy(this.startAllClicked,this));
		$('#toolbar-open').click($.proxy(this.openTorrentClicked,this));

		$('#upload_confirm_button').click($.proxy(this.confirmUploadClicked,this));
		$('#upload_cancel_button').click($.proxy(this.hideUploadDialog,this));

		$('#turtle-button').click($.proxy(this.toggleTurtleClicked,this));

		$('#inspector-close').click($.proxy(this.hideInspector,this));

		// tell jQuery to copy the dataTransfer property from events over if it exists
		jQuery.event.props.push("dataTransfer");

		$('#torrent_upload_form').submit(function() { $('#upload_confirm_button').click(); return false; });

		e = $('#filter-mode');
		$('input:radio[name=filter-mode][id=filter-' + this[Prefs._FilterMode] + ']').attr('checked', true);
		e.change($.proxy(this.onFilterModeClicked,this));
		$('#filter-tracker').change($.proxy(this.onFilterTrackerClicked,this));

		$('#torrent_container').bind('dragover', $.proxy(this.dragenter,this));
		$('#torrent_container').bind('dragenter', $.proxy(this.dragenter,this));
		$('#torrent_container').bind('drop', $.proxy(this.drop,this));

		this.setupSearchBox();
 
		e = {};
		e.torrent_list              = $('#torrent_list')[0];
		e.toolbar_buttons           = $('#toolbar ul li');
		e.toolbar_pause_button      = $('#toolbar-pause')[0];
		e.toolbar_start_button      = $('#toolbar-start')[0];
		this.elements = e;

		// Apply the prefs settings to the gui
		this.initializeSettings();

		// Get preferences & torrents from the daemon
		var async = false;
		this.loadDaemonPrefs(async);
		this.loadDaemonStats(async);
		this.initializeTorrents();
		this.refreshTorrents();
		this.togglePeriodicSessionRefresh(true);

		this.updateButtonsSoon();
	},

	loadDaemonPrefs: function(async) {
		this.remote.loadDaemonPrefs(function(data) {
			var o = data['arguments'];
			Prefs.getClutchPrefs(o);
			this.updateGuiFromSession(o);
			this.sessionProperties = o;
		}, this, async);
	},

	/*
	 * Load the clutch prefs and init the GUI according to those prefs
	 */
	initializeSettings: function()
	{
		Prefs.getClutchPrefs(this);

		var compact = false;
		this.torrentRenderer = new TorrentRendererFull();
	},

	/*
	 * Set up the search box
	 */
	setupSearchBox: function()
	{
		var tr = this;
		var search_box = $('#torrent_search');
		search_box.bind('keyup click', function() {
			tr.setFilterText(this.value);
		});
	},


	/****
	*****
	*****  UTILITIES
	*****
	****/

	getAllTorrents: function()
	{
		var torrents = [];
		for (var key in this._torrents)
			torrents.push(this._torrents[key]);
		return torrents;
	},

	getTorrentIds: function(torrents)
	{
		return $.map(torrents.slice(0), function(t) {return t.getId();});
	},

	scrollToRow: function(row)
	{
		var list = $('#torrent_container'),
		    scrollTop = list.scrollTop(),
		    innerHeight = list.innerHeight(),
		    offsetTop = row.getElement().offsetTop,
		    offsetHeight = $(row.getElement()).outerHeight();

		if (offsetTop < scrollTop)
			list.scrollTop(offsetTop);
		else if (innerHeight + scrollTop < offsetTop + offsetHeight)
			list.scrollTop(offsetTop + offsetHeight - innerHeight);
	},

	seedRatioLimit: function() {
		var p = this.sessionProperties;
		if (p && p.seedRatioLimited)
			return p.seedRatioLimit;
		return -1;
	},

	setPref: function(key, val)
	{
		this[key] = val;
		Prefs.setValue(key, val);
	},

	stopAllClicked: function(ev) {
		this.stopAllTorrents();
	},

	startAllClicked: function(ev) {
		this.startAllTorrents(false);
	},

	openTorrentClicked: function(ev) {
		$('body').addClass('open_showing');
		this.uploadTorrentFile();
		this.updateButtonStates();
	},

	dragenter: function(ev) {
		var efct;
	    try {
	    	efct = ev.dataTransfer.effectAllowed;
	    } catch (_error) {}
	    ev.dataTransfer.dropEffect = 'move' === efct || 'linkMove' === efct ? 'move' : 'copy';
	    ev.stopPropagation();
	    ev.preventDefault();
		return true;
	},

	drop: function(ev)
	{
		ev.stopPropagation();
    	ev.preventDefault();
		testtest = ev.dataTransfer.files;
		var i, uri, uris=null,
		    types = ["text/uri-list", "text/plain"],
		    paused = true;

		if (!ev.dataTransfer || !ev.dataTransfer.types)
			return true;

		for (i=0; !uris && i<types.length; ++i)
			if (ev.dataTransfer.types.indexOf(types[i]) != -1){
				uris = ev.dataTransfer.getData(types[i]).split("\n");
			}

		for (i=0; uri=uris[i]; ++i) {
			if (/^#/.test(uri)) // lines which start with "#" are comments
				continue;
			if (/^[a-z-]+:/i.test(uri)) // close enough to a url
				this.remote.addTorrentByUrl(uri, paused);
		}

		return false;
	},

	hideUploadDialog: function() {
		$('body.open_showing').removeClass('open_showing');
		$('#upload_container').hide();
		this.updateButtonStates();
	},

	confirmUploadClicked: function() {
		this.uploadTorrentFile(true);
		this.hideUploadDialog();
	},

	hideMoveDialog: function() {
		$('#move_container').hide();
		this.updateButtonStates();
	},

	// turn the periodic ajax session refresh on & off
	togglePeriodicSessionRefresh: function(enabled) {
		clearInterval(this.sessionInterval);
		delete this.sessionInterval;
		if (enabled) {
		        var callback = $.proxy(this.loadDaemonPrefs,this),
			    msec = 8000;
			this.sessionInterval = setInterval(callback, msec);
		}
	},

	toggleTurtleClicked: function()
	{
		var o = {};
		o[RPC._TurtleState] = !$('#turtle-button').hasClass('selected');
		this.remote.savePrefs(o);
	},

	/*--------------------------------------------
	 *
	 *  I N T E R F A C E   F U N C T I O N S
	 *
	 *--------------------------------------------*/

	setFilterText: function(search) {
		this.filterText = search ? search.trim() : null;
		this.refilter(true);
	},


	onTorrentChanged: function(ev, tor)
	{
		// update our dirty fields
		this.dirtyTorrents[ tor.getId() ] = true;

		// enqueue ui refreshes
		this.refilterSoon();
		this.updateButtonsSoon();
	},

	updateFromTorrentGet: function(updates, removed_ids)
	{
		var i, o, t, id, needed, needinfo = [],
		    callback, fields, tracker;

		for (i=0; o=updates[i]; ++i)
		{
			id = o.id;
			if (o.trackers){
				tracker = o.trackers.filter(function (tracker){
					var test = transmission.getDomainName(parseUri(tracker.announce).host);
					if (trakt.user.showTracker.indexOf(test) != -1 || trakt.user.movieTracker.indexOf(test) != -1){
						return tracker;
					}
				});
				if (tracker[0])
					tracker = this.getDomainName(parseUri(tracker[0].announce).host);
			}
			if ((t = this._torrents[id]))
			{
				needed = t.needsMetaData();
				t.refresh(o);
				if (needed && !t.needsMetaData())
					needinfo.push(id);
			}
			else if (tracker) {
				t = this._torrents[id] = new Torrent(o);
				this.dirtyTorrents[id] = true;
				callback = $.proxy(this.onTorrentChanged,this);
				$(t).bind('dataChanged',callback);
				// do we need more info for this torrent?
				if(!('name' in t.fields) || !('status' in t.fields))
					needinfo.push(id);

				t.notifyOnFieldChange('status', $.proxy(function (newValue, oldValue) {
					if (oldValue === Torrent._StatusDownload && (newValue == Torrent._StatusSeed || newValue == Torrent._StatusSeedWait)) {
						$(this).trigger('downloadComplete', [t]);
					} else if (oldValue === Torrent._StatusSeed && newValue === Torrent._StatusStopped && t.isFinished()) {
						$(this).trigger('seedingComplete', [t]);
					} else {
						$(this).trigger('statusChange', [t]);
					}
				}, this));
			}
		}

		if (needinfo.length) {
			// whee, new torrents! get their initial information.
			fields = ['id'].concat(Torrent.Fields.Metadata,
			                       Torrent.Fields.Stats);
			this.updateTorrents(needinfo, fields);
			this.refilterSoon();
		}

		if (removed_ids) {
			this.deleteTorrents(removed_ids);
			this.refilterSoon();
		}
	},

	updateTorrents: function(ids, fields)
	{
		this.remote.updateTorrents(ids, fields,
		                           this.updateFromTorrentGet, this);
	},

	refreshTorrents: function()
	{
		var callback = $.proxy(this.refreshTorrents,this),
		    msec = this[Prefs._RefreshRate] * 1000,
		    fields = ['id'].concat(Torrent.Fields.Stats);

		// send a request right now
		this.updateTorrents('recently-active', fields);

		// schedule the next request
		clearTimeout(this.refreshTorrentsTimeout);
		this.refreshTorrentsTimeout = setTimeout(callback, msec);
	},

	initializeTorrents: function()
	{
		var fields = ['id'].concat(Torrent.Fields.Metadata,
		                           Torrent.Fields.Stats);
		this.updateTorrents(null, fields);
	},

	onRowClicked: function(ev)
	{
		var meta_key = ev.metaKey || ev.ctrlKey,
		    row = ev.currentTarget.row;

		var torrents = [];
		torrents.push(row.getTorrent());

		// handle the per-row "torrent_resume" button
		if (ev.target.className === 'button torrent_resume') {
			this.startTorrent(row.getTorrent());
			return;
		}

		// handle the per-row "torrent_pause" button
		if (ev.target.className === 'button torrent_pause') {
			this.stopTorrent(row.getTorrent());
			return;
		}

		// handle the per-row "torrent_remove" button
		if (ev.target.className === 'button torrent_remove') {
			this.promptToRemoveTorrentsAndData(torrents);
			return;
		}

		// handle the per-row "torrent_inspector" button
		if (ev.target.className === 'button torrent_inspector') {
			this.showInspector(torrents);
			return;
		}
	},

	deleteTorrents: function(ids)
	{
		var i, id;

		if (ids && ids.length)
		{
			for (i=0; id=ids[i]; ++i) {
				this.dirtyTorrents[id] = true;
				delete this._torrents[id];
			}
			this.refilter();
		}
	},

	/*
	 * Select a torrent file to upload
	 * FIXME
	 */
	uploadTorrentFile: function(confirmed)
	{
		// Display the upload dialog
		if (! confirmed) {
			$('input#torrent_upload_file').attr('value', '');
			$('input#torrent_upload_url').attr('value', '');
			$('input#torrent_auto_start').attr('checked', true);
			$('#upload_container').show();
			$('#torrent_upload_url').focus();

		// Submit the upload form
		} else {
			var args = {};
			var remote = this.remote;
			var paused = false;
			if ('' != $('#torrent_upload_url').val()) {
				remote.addTorrentByUrl($('#torrent_upload_url').val(), { paused: paused });
			} else {
				args.url = '../upload?paused=' + paused;
				args.type = 'POST';
				args.data = { 'X-Transmission-Session-Id' : remote._token };
				args.dataType = 'xml';
				args.iframe = true;
				$('#torrent_upload_form').ajaxSubmit(args);
			}
		}
	},

	promptToRemoveTorrents: function(torrents) {
		if (torrents.length === 1)
		{
			var torrent = torrents[0],
			    header = 'Remove ' + torrent.getName() + '?',
			    message = 'Once removed, continuing the transfer will require the torrent file. Are you sure you want to remove it?';
			dialog.confirm(header, message, 'Remove', 'transmission.removeTorrents', torrents);
		}
		else
		{
			var header = 'Remove ' + torrents.length + ' transfers?',
			    message = 'Once removed, continuing the transfers will require the torrent files. Are you sure you want to remove them?';
			dialog.confirm(header, message, 'Remove', 'transmission.removeTorrents', torrents);
		}
	},

	promptToRemoveTorrentsAndData:function(torrents)
	{
		if (torrents.length === 1)
		{
			var torrent = torrents[0],
			    header = 'Remove ' + torrent.getName() + ' and delete data?',
			    message = 'All data downloaded for this torrent will be deleted. Are you sure you want to remove it?';
			dialog.confirm(header, message, 'Remove', 'transmission.removeTorrentsAndData', torrents);
		}
		else
		{
			var header = 'Remove ' + torrents.length + ' transfers and delete data?',
			    message = 'All data downloaded for these torrents will be deleted. Are you sure you want to remove them?';
			dialog.confirm(header, message, 'Remove', 'transmission.removeTorrentsAndData', torrents);
		}
	},

	removeTorrents: function(torrents) {
		var ids = this.getTorrentIds(torrents);
		this.remote.removeTorrents(ids, this.refreshTorrents, this);
	},

	removeTorrentsAndData: function(torrents) {
		this.remote.removeTorrentsAndData(torrents);
	},

	reannounceSelectedTorrents: function() {
		this.reannounceTorrents(this.getSelectedTorrents());
	},

	startAllTorrents: function(force) {
		this.startTorrents(this.getAllTorrents(), force);
	},
	startSelectedTorrents: function(force) {
		this.startTorrents(this.getSelectedTorrents(), force);
	},
	startTorrent: function(torrent) {
		this.startTorrents([ torrent ], false);
	},

	startTorrents: function(torrents, force) {
		this.remote.startTorrents(this.getTorrentIds(torrents), force,
		                          this.refreshTorrents, this);
	},
	verifyTorrent: function(torrent) {
		this.verifyTorrents([ torrent ]);
	},
	verifyTorrents: function(torrents) {
		this.remote.verifyTorrents(this.getTorrentIds(torrents),
		                           this.refreshTorrents, this);
	},

	reannounceTorrent: function(torrent) {
		this.reannounceTorrents([ torrent ]);
	},
	reannounceTorrents: function(torrents) {
		this.remote.reannounceTorrents(this.getTorrentIds(torrents),
		                               this.refreshTorrents, this);
	},

	stopAllTorrents: function() {
		this.stopTorrents(this.getAllTorrents());
	},
	stopSelectedTorrents: function() {
		this.stopTorrents(this.getSelectedTorrents());
	},
	stopTorrent: function(torrent) {
		this.stopTorrents([ torrent ]);
	},
	stopTorrents: function(torrents) {
		this.remote.stopTorrents(this.getTorrentIds(torrents),
		                         this.refreshTorrents, this);
	},
	changeFileCommand: function(torrentId, rowIndices, command) {
		this.remote.changeFileCommand(torrentId, rowIndices, command);
	},

	/***
	****
	***/

	updateGuiFromSession: function(o)
	{
		var limit, limited, e, b, text,
                    fmt = Transmission.fmt,
                    menu = $('#settings_menu');

		this.serverVersion = o.version;

		if (RPC._TurtleState in o)
		{
			b = o[RPC._TurtleState];
			e = $('#turtle-button');
			e.toggleClass('selected', b);
		}

	},

	updateStatusbar: function()
	{
		var u=0, d=0,
		    i, row, text,
		    fmt = Transmission.fmt,
		    torrents = this.getAllTorrents();

		// up/down speed
		for (i=0; row=torrents[i]; ++i) {
			u += row.getUploadSpeed();
			d += row.getDownloadSpeed();
		}

		$('#speed-up-container').toggleClass('active', u>0 );
		$('#speed-up-label').text( fmt.speedBps( u ) );

		$('#speed-dn-container').toggleClass('active', d>0 );
		$('#speed-dn-label').text( fmt.speedBps( d ) );

		// visible torrents
		$('#filter-count').text( fmt.countString('Torrent','Torrents',this._rows.length ) );
	},

	updateFilterSelect: function()
	{
		var i, names, name, str, o,
		    e = $('#filter-tracker'),
		    trackers = this.getTrackers();
	},

	updateButtonsSoon: function()
	{
		if (!this.buttonRefreshTimer)
		{
			var callback = $.proxy(this.updateButtonStates,this),
			    msec = 100;
			this.buttonRefreshTimer = setTimeout(callback, msec);
		}
	},

	updateButtonStates: function()
	{
		var e = this.elements,
		    haveActive = false,
		    havePaused = false,
		    haveSel = false,
		    haveActiveSel = false,
		    havePausedSel = false;

		clearTimeout(this.buttonRefreshTimer);
		delete this.buttonRefreshTimer;

		for (var i=0, row; row=this._rows[i]; ++i) {
			var isStopped = row.getTorrent().isStopped();
			if (!isStopped) haveActive = true;
			if (isStopped) havePaused = true;
		}

	},

	/****
	*****
	*****  INSPECTOR
	*****
	****/

	showInspector: function(torrents)
	{
		$('body').addClass('inspector_showing');
		this.inspector.setTorrents(torrents);
	},

	hideInspector: function(torrents)
	{
		$('body').removeClass('inspector_showing');
	},

	/****
	*****
	*****  FILTER
	*****
	****/

	refilterSoon: function()
	{
		if (!this.refilterTimer) {
			var tr = this,
			    callback = function(){tr.refilter(false);},
			    msec = 100;
			this.refilterTimer = setTimeout(callback, msec);
		}
	},

	sortRows: function(rows)
	{
		var i, tor, row,
		    id2row = {},
		    torrents = [];

		for (i=0; row=rows[i]; ++i) {
			tor = row.getTorrent();
			torrents.push(tor);
			id2row[ tor.getId() ] = row;
		}

		Torrent.sortTorrents(torrents, this[Prefs._SortMethod],
		                               this[Prefs._SortDirection]);

		for (i=0; tor=torrents[i]; ++i)
			rows[i] = id2row[ tor.getId() ];
	},

	refilter: function(rebuildEverything)
	{
		var i, e, id, t, row, tmp, rows, clean_rows, dirty_rows, frag,
		    sort_mode = this[Prefs._SortMethod],
		    sort_direction = this[Prefs._SortDirection],
		    filter_mode = this[Prefs._FilterMode],
		    filter_text = this.filterText,
		    filter_tracker = this.filterTracker,
		    renderer = this.torrentRenderer,
		    list = this.elements.torrent_list,
		    old_sel_count = $(list).children('.selected').length;

		clearTimeout(this.refilterTimer);
		delete this.refilterTimer;

		if (rebuildEverything) {
			$(list).empty();
			this._rows = [];
			for (id in this._torrents)
				this.dirtyTorrents[id] = true;
		}

		// rows that overlap with dirtyTorrents need to be refiltered.
		// those that don't are 'clean' and don't need refiltering.
		clean_rows = [];
		dirty_rows = [];
		for (i=0; row=this._rows[i]; ++i) {
			if(row.getTorrentId() in this.dirtyTorrents)
				dirty_rows.push(row);
			else
				clean_rows.push(row);
		}

		// remove the dirty rows from the dom
		e = [];
		for (i=0; row=dirty_rows[i]; ++i)
			e.push (row.getElement());
		$(e).detach();

		// drop any dirty rows that don't pass the filter test
		tmp = [];
		for (i=0; row=dirty_rows[i]; ++i) {
			id = row.getTorrentId();
			t = this._torrents[ id ];
			if (t && t.test(filter_mode, filter_text, filter_tracker))
				tmp.push(row);
			delete this.dirtyTorrents[id];
		}
		dirty_rows = tmp;

		// make new rows for dirty torrents that pass the filter test
		// but don't already have a row
		for (id in this.dirtyTorrents) {
			t = this._torrents[id];
			if (t && t.test(filter_mode, filter_text, filter_tracker)) {
				row = new TorrentRow(renderer, this, t);
				e = row.getElement();
				e.row = row;
				dirty_rows.push(row);
				$(e).click($.proxy(this.onRowClicked,this));
			}
		}

		// sort the dirty rows
		this.sortRows (dirty_rows);

		// now we have two sorted arrays of rows
		// and can do a simple two-way sorted merge.
		rows = [];
		var ci=0, cmax=clean_rows.length;
		var di=0, dmax=dirty_rows.length;
		frag = document.createDocumentFragment();
		while (ci!=cmax || di!=dmax)
		{
			var push_clean;

			if (ci==cmax)
				push_clean = false;
			else if (di==dmax)
				push_clean = true;
			else {
				var c = Torrent.compareTorrents(
				           clean_rows[ci].getTorrent(),
				           dirty_rows[di].getTorrent(),
				           sort_mode, sort_direction);
				push_clean = (c < 0);
			}

			if (push_clean)
				rows.push(clean_rows[ci++]);
			else {
				row = dirty_rows[di++];
				e = row.getElement();
				if (ci !== cmax)
					list.insertBefore(e, clean_rows[ci].getElement());
				else
					frag.appendChild(e);
				rows.push(row);
			}
		}
		list.appendChild(frag);

		// update our implementation fields
		this._rows = rows;
		this.dirtyTorrents = {};

		// sync gui
		this.updateStatusbar();
	},

	setFilterMode: function(mode)
	{
		// set the state
		this.setPref(Prefs._FilterMode, mode);

		// refilter
		this.refilter(true);
	},

	onFilterModeClicked: function(ev)
	{
		this.setFilterMode(ev.target.id.substr(7));
	},

	onFilterTrackerClicked: function(ev)
	{
		var tracker, type = ev.target.id.substr(7);
		tracker = type;
		if (tracker == "both")
			tracker = null;
		this.setFilterTracker(tracker);
	},

	setFilterTracker: function(domain)
	{
		// update which tracker is selected in the popup
		this.filterTracker = domain;
		this.refilter(true);
	},

	// example: "tracker.ubuntu.com" returns "ubuntu.com"
	getDomainName: function(host)
	{
		var dot = host.indexOf('.');
		if (dot !== host.lastIndexOf('.'))
			host = host.slice(dot+1);
		return host;
	},

	// example: "ubuntu.com" returns "Ubuntu"
	getReadableDomain: function(name)
	{
		if (name.length)
			name = name.charAt(0).toUpperCase() + name.slice(1);
		var dot = name.indexOf('.');
		if (dot !== -1)
			name = name.slice(0, dot);
		return name;
	},

	getTrackers: function()
	{
		var ret = {};

		var torrents = this.getAllTorrents();
		for (var i=0, torrent; torrent=torrents[i]; ++i)
		{
			var names = [];
			var trackers = torrent.getTrackers();
			for (var j=0, tracker; tracker=trackers[j]; ++j)
			{
				var uri, announce = tracker.announce;

				if (announce in this.uriCache)
					uri = this.uriCache[announce];
				else {
					uri = this.uriCache[announce] = parseUri (announce);
					uri.domain = this.getDomainName (uri.host);
					uri.name = this.getReadableDomain (uri.domain);
				}

				if (!(uri.name in ret))
					ret[uri.name] = { 'uri': uri,
					                  'domain': uri.domain,
					                  'count': 0 };

				if (names.indexOf(uri.name) === -1)
					names.push(uri.name);
			}
			for (var j=0, name; name=names[j]; ++j)
				ret[name].count++;
		}

		return ret;
	},

	/***
	****
	****  Statistics
	****
	***/

	// turn the periodic ajax stats refresh on & off
	togglePeriodicStatsRefresh: function(enabled) {
		clearInterval(this.statsInterval);
		delete this.statsInterval;
		if (enabled) {
			var callback = $.proxy(this.loadDaemonStats,this),
                            msec = 1000;
			this.statsInterval = setInterval(callback, msec);
		}
	},

	loadDaemonStats: function(async) {
		this.remote.loadDaemonStats(function(data) {
			this.updateStats(data['arguments']);
		}, this, async);
	},

	// Process new session stats from the server
	updateStats: function(stats)
	{
		var s, ratio,
		    fmt = Transmission.fmt;

		s = stats["current-stats"];
		ratio = Math.ratio(s.uploadedBytes,s.downloadedBytes);
		$('#stats-session-uploaded').html(fmt.size(s.uploadedBytes));
		$('#stats-session-downloaded').html(fmt.size(s.downloadedBytes));
		$('#stats-session-ratio').html(fmt.ratioString(ratio));
		$('#stats-session-duration').html(fmt.timeInterval(s.secondsActive));

		s = stats["cumulative-stats"];
		ratio = Math.ratio(s.uploadedBytes,s.downloadedBytes);
		$('#stats-total-count').html(s.sessionCount + " times");
		$('#stats-total-uploaded').html(fmt.size(s.uploadedBytes) + " Total");
		$('#stats-total-downloaded').html(fmt.size(s.downloadedBytes) + " Total");
		$('#stats-total-ratio').html(fmt.ratioString(ratio));
		$('#stats-total-duration').html(fmt.timeInterval(s.secondsActive));
		$('#stats-torrent-count').html(stats.torrentCount);
	}
};
