/**
 * Copyright © Jordan Lee, Dave Perrett, Malcolm Jarvis and Bruno Bierbaumer
 *
 * This file is licensed under the GPLv2.
 * http://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 */

function Inspector(controller) {

    var data = {
        controller: null,
        elements: { },
        torrents: [ ]
    },

    needsExtraInfo = function (torrents) {
        var i, id, tor;

        for (i = 0; tor = torrents[i]; i++)
            if (!tor.hasExtraInfo())
                return true;

        return false;
    },

    refreshTorrents = function () {
        var fields,
            ids = $.map(data.torrents.slice(0), function (t) {return t.getId();});

        if (ids && ids.length)
        {
            fields = ['id'].concat(Torrent.Fields.StatsExtra);

            if (needsExtraInfo(data.torrents))
                $.merge(fields, Torrent.Fields.InfoExtra);

            data.controller.updateTorrents(ids, fields);
        }
    },

    updateInspector = function () {
        updateFilesPage();
    },

    /****
    *****  FILES PAGE
    ****/

    changeFileCommand = function(fileIndices, command) {
        var torrentId = data.file_torrent.getId();
        data.controller.changeFileCommand(torrentId, fileIndices, command);
    },

    onFileWantedToggled = function(ev, fileIndices, want) {
        changeFileCommand(fileIndices, want?'files-wanted':'files-unwanted');
    },

    clearFileList = function() {
        $(data.elements.file_list).empty();
        delete data.file_torrent;
        delete data.file_torrent_n;
        delete data.file_rows;
    },

    addNodeToView = function (tor, file, indices) {
        var row, parent;
        parent = $("#inspector_file_list");
        row = new FileRow(tor, file.name, indices);
        data.file_rows.push(row);
        parent.append(row.getElement());
        $(row).bind('wantedToggled',onFileWantedToggled);
    },
                
    updateFilesPage = function() {
        var i, n, tor, fragment, tree,
            file_list = data.elements.file_list,
            torrents = data.torrents;

        tor = torrents[0];
        n = tor ? tor.getFileCount() : 0;
        if (tor!=data.file_torrent || n!=data.file_torrent_n) {
            // rebuild the file list...
            clearFileList();
            data.file_torrent = tor;
            data.file_torrent_n = n;
            data.file_rows = [ ];
            fragment = document.createDocumentFragment();
            if (tor.fields.files && tor.fields.files.length >= 2 && tor.getMediaType() == "shows"){
                tor.fields.files.forEach(function(file, index){
                    addNodeToView(tor, file, index);
                });
            }
            file_list.appendChild (fragment);
        } else {
            // ...refresh the already-existing file list
            for (i=0, n=data.file_rows.length; i<n; ++i)
                data.file_rows[i].refresh();
        }
    },

    initialize = function (controller) {
        data.controller = controller;
        data.elements.file_list      = $('#inspector_file_list')[0];
    };

    /****
    *****  PUBLIC FUNCTIONS
    ****/

    this.setTorrents = function (torrents) {
        var d = data;
        inspector = torrents[0].getId();

        // update the inspector when a selected torrent's data changes.
        $(d.torrents).unbind('dataChanged.inspector');
        $(torrents).bind('dataChanged.inspector', $.proxy(updateInspector,this));
        d.torrents = torrents;

        $('#torrent_inspector .fanart').css('background-image', 'url(' + d.torrents[0].getFanart() + ')');

        $('#torrent_inspector .toolbar .title').empty();
        
        e = document.createElement('span');
        e.className = "torrent_name";
        setTextContent(e, d.torrents[0].getName());
        $('#torrent_inspector .toolbar .title').append(e);

        e = document.createElement('span');
        e.className = "torrent_meta";
        setTextContent(e, d.torrents[0].getMeta());
        $('#torrent_inspector .toolbar .title').append(e);

        $('#torrent_inspector .fanart').empty();

        var progress = document.createElement('div');
        progress.className = 'torrent_progress';
        torrent_progress = parseInt(d.torrents[0].getPercentDone() * 100) + "%";
        setTextContent(progress, torrent_progress);
        var pause_resume = document.createElement('div');
        var is_stopped = d.torrents[0].isStopped();
        pause_resume.className = is_stopped ? 'button torrent_toggle torrent_resume' : 'button torrent_toggle torrent_pause';
        var remove = document.createElement('div');
        remove.className = 'button torrent_remove';
        var button = document.createElement('div');
        button.className = 'torrent_buttons';

        button.appendChild(pause_resume);
        button.appendChild(remove);

        $('#torrent_inspector .fanart').append(progress);
        $('#torrent_inspector .fanart').append(button);

        $(".torrent_toggle").bind('click',function(){
            if (this.className == 'button torrent_toggle torrent_pause'){
                this.className = 'button torrent_toggle torrent_resume';
                transmission.stopTorrent(d.torrents[0]);    
            }else{
                this.className = 'button torrent_toggle torrent_pause';
                transmission.startTorrent(d.torrents[0]);
            }
        });
        $(".torrent_remove").bind('click',function(){ transmission.promptToRemoveTorrentsAndData(d.torrents) });

        // periodically ask for updates to the inspector's torrents
        clearInterval(d.refreshInterval);
        d.refreshInterval = setInterval($.proxy(refreshTorrents,this), 2000);
        refreshTorrents();

        // refresh the inspector's UI
        updateInspector();
    };

    initialize (controller);
};
