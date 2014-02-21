ntorrent
========

A fork of the [Transmission](http://www.transmissionbt.com) web UI that matches TV and Movie torrents with data from your Trakt.tv account.

###Setup

You will need the following:

- trakt.tv account and [API key](http://trakt.tv/api-docs/user-profile)
- Transmission installed and locate your **web** directory to replace with ntorrent's data

On OS X:

	~/Library/Application Support/Transmission/web

- Specific TV and Movie trackers to help identify what media type a torrent is

###Assumptions

ntorrent assumes that you make liberal use of Trakt's watchlist features for movies and TV shows that do not exist in your library, but you do have an interest in watching.

The interface is very basic and strips out many features you may be reliant on. ntorrent is mostly a fun project and not a power user interface that will solve all your problems.

There will be bugs. There will be torrents that will not match properly and have blank data. Over time these issues will hopefully be resolved, but for now ntorrent is highly experimental.