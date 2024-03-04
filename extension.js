/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = "kubectl-context-extension";

const { Clutter, Gio, GLib, GObject, St } = imports.gi;


const Gettext = imports.gettext.domain(GETTEXT_DOMAIN);
const _ = Gettext.gettext;

const ByteArray = imports.byteArray;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const MainLoop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("Kubectl Context Indicator"));

      log(`${Me.metadata.name}: Initializing`);

      let box = new St.BoxLayout({ style_class: "panel-status-menu-box" });
      let svg = Gio.icon_new_for_string(Me.path + "/kube.svg");
      let icon = new St.Icon({
        gicon: svg,
        style_class: "system-status-icon",
      });

      this.currentContextLabel = new St.Label({
        text: _("loading.."),
        y_align: Clutter.ActorAlign.CENTER,
      });

      box.add_child(icon);
      box.add_child(this.currentContextLabel);
      box.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
      this.add_child(box);


      const homeDir = GLib.get_home_dir();
      this.configFile = Gio.File.new_for_path(`${homeDir}/.kube/config`);


      log(`${Me.metadata.name}: Build monitor service`);

      this.monitor = this.configFile.monitor_file(Gio.FileMonitorFlags.NONE, null);

      this.monitor.connect("changed", (monitor, configFile, otherFile, eventType) => {
        log(`${Me.metadata.name}: Detected file changes - ${configFile.get_path()}`);
        this.onFileChanged(monitor, configFile, otherFile, eventType);
      });


      let contexts = this.getClusters();
      contexts.forEach((context) => {

        let item = new PopupMenu.PopupMenuItem(_(context));

        log(`Adding context ${item}`);
        
        item.connect("activate", () => {
          log(`${Me.metadata.name}: Switching to context ${context}`);
          GLib.spawn_command_line_async(`kubectl config use-context ${context}`);
          this.currentContextLabel.queue_redraw();
        });
        this.menu.addMenuItem(item);
      });
      this.poll();
    }

    destroy() {
      GLib.Source.remove(this.ticker);
      super.destroy();
    }

    poll() {
      const interval = 1000;
      this.ticker = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        this.currentContextLabel.queue_redraw();
        return true;
      });
    }

    onFileChanged(monitor, file, otherFile, eventType) {
      log(`${Me.metadata.name}: Event ${eventType} detected`)
      if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
        log(`${Me.metadata.name}: File changed - ${this.configFile.get_path()}`);
        this.getClusters();
      }
    }

    getClusters() {
      log(`${Me.metadata.name}: Get clusters`);

      try {
        let config = this.readKubeConfig();
        if (config) {
          
          let contextNames = this.extractContextNames(config);
          contextNames.forEach(name => log(`${Me.metadata.name}: Found cluster: ${name}`));

          return contextNames
        } else {
          log('${Me.metadata.name}: Could not read Kubernetes config file.');
        }
      } catch (e) {
        this.currentContextLabel.set_text(_("error"));
        logError(e, "ExtensionError");
      } finally {
        this.currentContextLabel.queue_redraw();
      }
    }

    readKubeConfig() {
      log(`${Me.metadata.name}: Read kube config`);

      try {
        let [success, contents] = this.configFile.load_contents(null);
        if (success) {
          return ByteArray.toString(contents);
        }
      } catch (e) {
        logError(e, 'Failed to read Kubernetes config file');
      }

      return null;
    }


    extractContextNames(config) {
      log(`${Me.metadata.name}: Extract context names`);

      let contextNames = [];
      let lines = config.split('\n');``
      let isContextBlock = false;

      for (let line of lines) {
        line = line.trim();

        if (line.startsWith('current-context:')) {
          let currentContext = line.split(':')[1].trim();
          this.currentContextLabel.set_text(currentContext);
          log(`${Me.metadata.name}: Set current context`);
        }
        else if (line.startsWith('- context:')) {
          isContextBlock = true;
        } else if (isContextBlock && line.startsWith('name:')) {
          let contextName = line.split(':')[1].trim();
          contextNames.push(contextName);
          isContextBlock = false;
        }
      }
      return contextNames;
    }

});

class Extension {
  constructor(uuid) {
    this._uuid = uuid;
    this.ticker;

    ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
  }
  
  enable() {
    log(`${_("enabling")} ${Me.metadata.name}`);

    this._indicator = new Indicator();
    Main.panel.addToStatusArea(this._uuid, this._indicator);
  }

  disable() {
    log(`${_("disabling")} ${Me.metadata.name}`);

    this._indicator.destroy();
    this._indicator = null;
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}
