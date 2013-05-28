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
        var e = data.elements,
            torrents = data.torrents,
            name;

        // update the name, which is shown on all the pages
        if (!torrents || !torrents.length)
            name = 'No Selection';
        else if(torrents.length === 1)
            name = torrents[0].getName();
        else
            name = '' + torrents.length+' Transfers Selected';
        setTextContent(e.name_lb, name || na);

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

    onNameClicked = function(ev, fileRow, fileIndices) {
        $(fileRow.getElement()).siblings().slideToggle();
    },

    clearFileList = function() {
        $(data.elements.file_list).empty();
        delete data.file_torrent;
        delete data.file_torrent_n;
        delete data.file_rows;
    },

    createFileTreeModel = function (tor) {
        var i, j, n, name, tokens, walk, tree, token, sub,
            leaves = [ ],
            tree = { children: { }, file_indices: [ ] };

        n = tor.getFileCount();
        for (i=0; i<n; ++i) {
            name = tor.getFile(i).name;
            tokens = name.split('/');
            walk = tree;
            for (j=0; j<tokens.length; ++j) {
                token = tokens[j];
                sub = walk.children[token];
                if (!sub) {
                    walk.children[token] = sub = {
                      name: token,
                      parent: walk,
                      children: { },
                      file_indices: [ ],
                      depth: j
                    };
                }
                walk = sub;
            }
            walk.file_index = i;
            delete walk.children;
            leaves.push (walk);
        }

        for (i=0; i<leaves.length; ++i) {
            walk = leaves[i];
            j = walk.file_index;
            do {
                walk.file_indices.push (j);
                walk = walk.parent;
            } while (walk);
        }

        return tree;
    },

    addNodeToView = function (tor, parent, sub, i) {
        var row;
        row = new FileRow(tor, sub.depth, sub.name, sub.file_indices, i%2);
        data.file_rows.push(row);
        parent.appendChild(row.getElement());
        $(row).bind('wantedToggled',onFileWantedToggled);
        $(row).bind('nameClicked',onNameClicked);
    },

    addSubtreeToView = function (tor, parent, sub, i) {
        var key, div;
        div = document.createElement('div');
        if (sub.parent)
            addNodeToView (tor, div, sub, i++);
        if (sub.children)
            for (key in sub.children)
                i = addSubtreeToView (tor, div, sub.children[key]);  
        parent.appendChild(div);
        return i;
    },
                
    updateFilesPage = function() {
        var i, n, tor, fragment, tree,
            file_list = data.elements.file_list,
            torrents = data.torrents;

        // only show one torrent at a time
        if (torrents.length !== 1) {
            clearFileList();
            return;
        }

        tor = torrents[0];
        n = tor ? tor.getFileCount() : 0;
        if (tor!=data.file_torrent || n!=data.file_torrent_n) {
            // rebuild the file list...
            clearFileList();
            data.file_torrent = tor;
            data.file_torrent_n = n;
            data.file_rows = [ ];
            fragment = document.createDocumentFragment();
            tree = createFileTreeModel (tor);
            addSubtreeToView (tor, fragment, tree, 0);
            file_list.appendChild (fragment);
        } else {
            // ...refresh the already-existing file list
            for (i=0, n=data.file_rows.length; i<n; ++i)
                data.file_rows[i].refresh();
        }
    },

    initialize = function (controller) {

        var ti = '#torrent_inspector_';

        data.controller = controller;

        data.elements.files_page     = $('#inspector-page-files')[0];

        data.elements.file_list      = $('#inspector_file_list')[0];
        
        data.elements.name_lb        = $('#torrent_inspector_name')[0];

        // force initial 'N/A' updates on all the pages
        updateInspector();
        updateFilesPage();
    };

    /****
    *****  PUBLIC FUNCTIONS
    ****/

    this.setTorrents = function (torrents) {
        var d = data;

        // update the inspector when a selected torrent's data changes.
        $(d.torrents).unbind('dataChanged.inspector');
        $(torrents).bind('dataChanged.inspector', $.proxy(updateInspector,this));
        d.torrents = torrents;

        // periodically ask for updates to the inspector's torrents
        clearInterval(d.refreshInterval);
        d.refreshInterval = setInterval($.proxy(refreshTorrents,this), 2000);
        refreshTorrents();

        // refresh the inspector's UI
        updateInspector();
    };

    initialize (controller);
};
