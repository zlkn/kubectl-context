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

      log(`Initializing ${Me.metadata.name}`);

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


      log(`Set constants ${Me.metadata.name}`);

      const homeDir = GLib.get_home_dir();
      const configFile = Gio.File.new_for_path(`${homeDir}/.kube/config`);


      log(`Build monitor service ${Me.metadata.name}`);

      const monitor = configFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
      monitor.connect('changed', this.onFileChanged);


      log(`Get contexts ${Me.metadata.name}`);

      let contexts = this.getClusters(configFile);
      contexts.forEach((context) => {

        let item = new PopupMenu.PopupMenuItem(_(context));

        log(`Adding context ${item}`);
        
        item.connect("activate", () => {
          GLib.spawn_command_line_sync(`kubectl config use-context ${context}`);
        });
        this.menu.addMenuItem(item);
      });
      // this.poll();
    }

    destroy() {
      GLib.Source.remove(this.ticker);
      super.destroy();
    }

    onFileChanged(monitor, file, otherFile, eventType) {
      if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
        log(`File changed: ${file.get_path()}`);
        getClusters();
      }
    }

    getClusters(configFile) {
      let config = this.readKubeConfig(configFile);
      if (config) {
        let contextNames = this.extractContextNames(config);
        contextNames.forEach(name => log(`Found cluster: ${name}`));
        return contextNames
      } else {
        log('Could not read Kubernetes config file.');
      }

    }

    readKubeConfig(configFile) {
      try {
        let [success, contents] = configFile.load_contents(null);
        if (success) {
          return ByteArray.toString(contents);
        }
      } catch (e) {
        logError(e, 'Failed to read Kubernetes config file');
      }

      return null;
    }

    extractContextNames(config) {
      let contextNames = [];
      let lines = config.split('\n');
      let isContextBlock = false;

      for (let line of lines) {
        line = line.trim();
        if (line.startsWith('- context:')) {
          isContextBlock = true;
        } else if (isContextBlock && line.startsWith('name:')) {
          let contextName = line.split(':')[1].trim();
          contextNames.push(contextName);
          isContextBlock = false;
        }
      
    return contextNames;
  }

    // getContexts() {
    //   try {
    //     const [ok, standard_output, standard_error, exit_status] =
    //       GLib.spawn_command_line_sync("kubectl config get-contexts -oname");
    //     if (ok) {
    //       let contexts = ByteArray.toString(standard_output).trim();
    //       return contexts.split("\n");
    //     } else {
    //       let err = ByteArray.toString(standard_error).trim();
    //       throw new Error(err);
    //     }
    //   } catch (e) {
    //     this.currentContextLabel.set_text(_("error"));
    //     logError(e, "ExtensionError");
    //   } finally {
    //     this.currentContextLabel.queue_redraw();
    //   }
    // }

    // poll() {
    //   const interval = 1000;
    //   this.ticker = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
    //     // this.refreshCurrentContext();
    //     return true;
    //   });
    }

    // refreshCurrentContext() {
    //   try {
    //     const [ok, standard_output, standard_error, exit_status] =
    //       GLib.spawn_command_line_sync("kubectl config current-context");
    //     if (ok) {
    //       let currentContext = ByteArray.toString(standard_output).trim();
    //       this.currentContextLabel.set_text(currentContext);
    //     } else {
    //       let err = ByteArray.toString(standard_error).trim();
    //       throw new Error(err);
    //     }
    //   } catch (e) {
    //     this.currentContextLabel.set_text(_("error"));
    //     logError(e, "ExtensionError");
    //   } finally {
    //     this.currentContextLabel.queue_redraw();
    //   }
    // }
  }
);

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
