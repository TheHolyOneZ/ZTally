

var SERVICE = "eu.zsync.ZTally";
var PATH = "/eu/zsync/ZTally";
var IFACE = "eu.zsync.ZTally.KWin";

var watched = [];

function report(w) {
    if (!w) {
        callDBus(SERVICE, PATH, IFACE, "Update", "", "", 0);
        return;
    }
    callDBus(SERVICE, PATH, IFACE, "Update", String(w.resourceClass || ""), String(w.caption || ""), w.pid | 0);
}

function current() {
    return workspace.activeWindow !== undefined ? workspace.activeWindow : workspace.activeClient;
}

function onActivated(w) {
    report(w);
    if (w && watched.indexOf(w) < 0) {
        watched.push(w);
        w.captionChanged.connect(function () {
            if (current() === w) report(w);
        });
        if (w.closed) {
            w.closed.connect(function () {
                var i = watched.indexOf(w);
                if (i >= 0) watched.splice(i, 1);
            });
        }
    }
}

if (workspace.windowActivated) {
    workspace.windowActivated.connect(onActivated);
} else {
    workspace.clientActivated.connect(onActivated);
}
onActivated(current());
