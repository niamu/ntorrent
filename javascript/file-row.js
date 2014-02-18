/**
 * Copyright © Mnemosyne LLC
 *
 * This file is licensed under the GPLv2.
 * http://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 */

function FileRow(torrent, name, indices)
{
	var fields = {
		have: 0,
		indices: [],
		isWanted: true,
		me: this,
		size: 0,
		torrent: null
	},

	elements = {
		progress: null,
		root: null
	},

	initialize = function(torrent, name, indices) {
		fields.torrent = torrent;
		fields.indices = [indices];
		createRow(torrent, name);
	},

	refreshWantedHTML = function()
	{
		var e = $(elements.root);
		e.toggleClass('skip', !fields.isWanted);
		e.toggleClass('complete', isDone());
		$(e[0].checkbox).prop('disabled', !isEditable());
		$(e[0].checkbox).prop('checked', fields.isWanted);
	},
	refreshProgressHTML = function()
	{
		var pct = 100 * (fields.size ? (fields.have / fields.size) : 1.0),
		    c = [ Transmission.fmt.percentString(pct), '%' ].join('');
		setTextContent(elements.progress, c);
	},
	refreshImpl = function() {
		var file,
		    have = 0,
		    size = 0,
		    wanted = false;

        file = fields.torrent.getFile(fields.indices[0]);
        have += file.bytesCompleted;
		size += file.length;
		wanted |= file.wanted;

		if ((fields.have != have) || (fields.size != size)) {
			fields.have = have;
			fields.size = size;
			refreshProgressHTML();
		}

		if (fields.isWanted !== wanted) {
			fields.isWanted = wanted;
			refreshWantedHTML();
		}
	},

	isDone = function () {
		return fields.have >= fields.size;
	},
	isEditable = function () {
		return (fields.torrent.getFileCount()>1) && !isDone();
	},

	createRow = function(torrent, name) {
		var e, root, box;

		root = document.createElement('li');
		root.className = 'inspector_torrent_file_list_entry';
		elements.root = root;

		var label = document.createElement('label');
		root.appendChild(label);

		e = document.createElement('input');
		e.type = 'checkbox';
		e.className = "file_wanted_control";
		e.title = 'Download file';
		$(e).change(function(ev){ fireWantedChanged( $(ev.currentTarget).prop('checked')); });
		root.checkbox = e;
		label.appendChild(e);

		e = document.createElement('div');
		e.className = "inspector_torrent_file_list_entry_progress";
		label.appendChild(e);
		$(e).click(function(){ fireNameClicked(-1); });
		elements.progress = e;

		e = document.createElement('div');
		e.className = "inspector_torrent_file_list_entry_name";
		setTextContent(e, name.split("/").pop());
		$(e).click(function(){ fireNameClicked(-1); });
		label.appendChild(e);

		refreshImpl();
		return root;
	},

	fireWantedChanged = function(do_want) {
		$(fields.me).trigger('wantedToggled',[ fields.indices, do_want ]);
	},
	fireNameClicked = function() {
		$(fields.me).trigger('nameClicked',[ fields.me, fields.indices ]);
	};

	/***
	****  PUBLIC
	***/

	this.getElement = function() {
		return elements.root;
	};
	this.refresh = function() {
		refreshImpl();
	};

	initialize(torrent, name, indices);
};
