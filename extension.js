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



import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(indicatorName, metadata, isActive) {
      super._init(0.0, indicatorName);
      this.metadata = metadata;
      this.isActive = isActive;

      console.error(`${this.metadata.name}: Initializing`);

      let box = new St.BoxLayout({ style_class: "panel-status-menu-box" });
      let svg = Gio.icon_new_for_string(this.metadata.path + "/kube.svg");
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
      console.error(`${this.metadata.name}: Config file ${this.configFile.get_path()}`);


      console.error(`${this.metadata.name}: Build monitor service`);

      this.monitor = this.configFile.monitor_file(Gio.FileMonitorFlags.NONE, null);

      this.monitor.connect("changed", (monitor, configFile, otherFile, eventType) => {
        console.error(`${this.metadata.name}: Detected file changes - ${configFile.get_path()}`);
        this.onFileChanged(monitor, configFile, otherFile, eventType);
      });


      let contexts = this.getClusters();
      console.error(`${this.metadata.name}: Contexts ${contexts}`);
      contexts.forEach((context) => {

        let item = new PopupMenu.PopupMenuItem(_(context));

        console.error(`Adding context ${item}`);
        
        item.connect("activate", () => {
          console.error(`${this.metadata.name}: Switching to context ${context}`);
          GLib.spawn_command_line_async(`kubectl config use-context ${context}`);
          this.currentContextLabel.queue_redraw();
        });
        this.menu.addMenuItem(item);
      });
    }

    destroy() {
      GLib.Source.remove(this.ticker);
      super.destroy();
    }

    onFileChanged(monitor, file, otherFile, eventType) {
      console.error(`${this.metadata.name}: Event ${eventType} detected`)
      if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
        console.error(`${this.metadata.name}: File changed - ${this.configFile.get_path()}`);
        this.getClusters();
      }
    }

    getClusters() {
      console.error(`${this.metadata.name}: Get clusters`);

      try {
        let config = this.readKubeConfig();
        if (config) {
          
          let contextNames = this.extractContextNames(config);
          contextNames.forEach(name => console.error(`${this.metadata.name}: Found cluster: ${name}`));

          return contextNames
        } else {
          console.error(`${this.metadata.name}: Could not read Kubernetes config file.`);
        }
      } catch (e) {
        this.currentContextLabel.set_text(_("error"));
        console.error(e, "ExtensionError");
      } finally {
        this.currentContextLabel.queue_redraw();
      }
    }

    readKubeConfig() {
      console.error(`${this.metadata.name}: Read kube config`);

      try {
        let [success, contents] = this.configFile.load_contents(null);
        if (success) {
          let decoder = new TextDecoder('utf-8');
          return decoder.decode(contents);
        }
      } catch (e) {
        console.error(e, 'Failed to read Kubernetes config file');
      }

      return null;
    }


    extractContextNames(config) {
      console.error(`${this.metadata.name}: Extract context names`);

      let contextNames = [];
      let lines = config.split('\n');``
      let isContextBlock = false;

      for (let line of lines) {
        line = line.trim();

        if (line.startsWith('current-context:')) {
          let currentContext = line.split(':')[1].trim();
          this.currentContextLabel.set_text(currentContext);
          console.error(`${this.metadata.name}: Set current context`);
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

export default class ExampleExtension extends Extension {
  constructor(metadata) {
    super(metadata);

    console.debug(`${this.metadata.name}: Constructing`);

    this.ticker;
  }
  
  enable() {
    console.error(`${_("enabling")} ${this.metadata.name}`);

    this._indicator = new Indicator("kubectl-context-extension", this.metadata, false);
    Main.panel.addToStatusArea(this._uuid, this._indicator);
  }

  disable() {
    console.error(`${_("disabling")} ${this.metadata.name}`);

    this._indicator.destroy();
    this._indicator = null;
  }
}

function init(meta) {
  // return new Extension(meta.uuid);
  return new Extension(meta);
}
