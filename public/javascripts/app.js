$(function () {
    var players = {
        youtube:    new Player.YouTube(),
        soundcloud: new Player.SoundCloud(),
        audioTag:   new Player.AudioTag()
    };

    var socket = io.connect(location.protocol + '//' + location.host);
    socket.on('init', function (data) {
        console.log(data);
        $('#client-info').text('You are ' + (data.isPrimary ? 'prim' : 'echo'));
    });
    socket.on('play', function (track) {
        console.log('play track=' + JSON.stringify(track));
        if (!track) return;
        var player = players[track.type];
        if (player) {
            socket.emit('update', { state: 'playing' });
            player.play(track).done(function () {
                socket.emit('update', { state: 'waiting' });
                console.log('done');
            });
        }
    });
});

// Player {{{
function Player () {
    this.deferreds = {};
}

Player.prototype = {
    play: function (track) {
        // cancel previous play
        if (this.deferreds['play']) {
            this.deferreds['play'].reject();
        }

        var self = this;
        this.prepare(track).done(function () { self._play(track) });

        return this.deferreds['play'] = $.Deferred();
    },
    playEnded: function () {
        if (this.deferreds['play']) {
            this.deferreds['play'].resolve();
        }
    },
    prepare: function (track) {
        return this.deferreds['prepare'] = this.deferreds['prepare'] || this._prepare(track);
    },
    _prepare: function () {
        var d = $.Deferred();
        d.resolve();
        return d;
    }
};
// }}}

// YouTube {{{
// https://developers.google.com/youtube/iframe_api_reference
Player.YouTube = function () {
    this.PLAYER_PLACEHOLDER_ID = 'player-youtube-placeholder';
    Player.call(this);
};

Player.YouTube.prototype = $.extend(
    new Player, {
    _play: function (track) {
        this.player.loadVideoById(track.videoId);
    },
    _prepare: function (track) {
        var d = $.Deferred();

        $.getScript('//www.youtube.com/iframe_api');

        $('<div/>', { id: this.PLAYER_PLACEHOLDER_ID }).appendTo(document.body);

        var youtube = this;
        window.onYouTubeIframeAPIReady = function () {
            youtube.player = new YT.Player(youtube.PLAYER_PLACEHOLDER_ID, {
                videoId: track.videoId,
                playerVars: { autoplay: 1, controls: 0 },
                events: {
                    onReady: function () {
                        d.resolve();
                    },
                    onStateChange: function (e) {
                        if (e.data === YT.PlayerState.ENDED) {
                            youtube.playEnded();
                        }
                    }
                }
            });
        };

        return d;
    },
    extractVideoId: function (url) {
        return url.match(/[\?&]v=([^&]+)/)[1];
    }
}
);
// }}}

// SoundCloud {{{
// http://developers.soundcloud.com/docs#playing
// http://developers.soundcloud.com/docs/api/html5-widget
Player.SoundCloud = function () {
    this.PLAYER_IFRAME_ID = 'player-soundcloud-iframe';
    this.CLIENT_ID = '98365098cb72a68cf93fda1fcebf48e8';
    Player.call(this);
};

Player.SoundCloud.prototype = $.extend(
    new Player(), {
    _play: function (track) {
        var url = track.url;
        var soundcloud = this;
        console.log('embed ' + url);
        SC.oEmbed(url, { auto_play: true, buying: false, liking: false, download: false, sharing: false, show_comments: false, show_playcount: false }, function (oEmbed) {
            var iframe = $(oEmbed.html).appendTo(document.body);
            if (!iframe.is('iframe')) {
                console.log('got no iframe', iframe);
            }
            var widget = SC.Widget(iframe.get(0));
            widget.bind(
                SC.Widget.Events.FINISH,
                function () { soundcloud.playEnded() }
            );
        });
    },
    _prepare: function () {
        return $.when(
            $.getScript('http://connect.soundcloud.com/sdk.js'),
            $.getScript('http://w.soundcloud.com/player/api.js')
        );
    }
}
);
// }}}

// AudioTag {{{
Player.AudioTag = function () {
    Player.call(this);
};

Player.AudioTag.prototype = $.extend(
    new Player(), {
    _play: function (track) {
        var url = track.url;
        var audioTag = this;
        var audio = $('<audio controls autoplay/>')
        .attr('src', url)
        .appendTo(document.body)
        .bind('ended', function () {
            console.log('ended');
            audioTag.playEnded();
        });
    }
}
);
// }}}
