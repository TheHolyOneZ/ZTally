

import Gio from 'gi://Gio';

const IFACE = `
<node>
  <interface name="eu.zsync.ZTally.Focus">
    <method name="GetFocused">
      <arg type="s" direction="out" name="wmClass"/>
      <arg type="s" direction="out" name="title"/>
      <arg type="i" direction="out" name="pid"/>
    </method>
  </interface>
</node>`;

export default class ZTallyFocus {
    enable() {
        this._impl = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._impl.export(Gio.DBus.session, '/eu/zsync/ZTally');
    }

    disable() {
        this._impl?.unexport();
        this._impl = null;
    }

    GetFocused() {
        const w = global.display.focus_window;
        if (!w)
            return ['', '', 0];
        const cls = w.get_sandboxed_app_id?.() || w.get_wm_class() || w.get_gtk_application_id?.() || '';
        return [cls, w.get_title() || '', w.get_pid() || 0];
    }
}
