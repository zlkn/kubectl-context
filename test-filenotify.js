#!/usr/bin/gjs

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;


const homeDir = GLib.get_home_dir();
const configFile = Gio.File.new_for_path(`${homeDir}/.kube/config`);

function readKubeConfig() {
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


function extractContextNames(config) {
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
    }

    return contextNames;
}


function getClusters() {
    let config = readKubeConfig();
    if (config) {
        let contextNames = extractContextNames(config);
        contextNames.forEach(name => log(`Found cluster: ${name}`));
    } else {
        log('Could not read Kubernetes config file.');
    }
}

function onFileChanged(monitor, file, otherFile, eventType) {
    if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
        log(`File changed: ${file.get_path()}`);
        getClusters();
    }
}



const monitor = configFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
monitor.connect('changed', onFileChanged);

const loop = new GLib.MainLoop(null, false);
loop.run();
