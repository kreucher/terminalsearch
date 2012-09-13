/* Terminal profiles search provider for Gnome Shell.
 *
 * Copyright 2012 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const DBus = imports.dbus;
const Lang = imports.lang;
const Main = imports.ui.main;
const Search = imports.ui.search;
const Shell = imports.gi.Shell;
const Util = imports.misc.util;

const NAME = 'TERMINAL PROFILES';
const GNOME_TERMINAL = 'gnome-terminal';
const DEBUG = false;

const GConfDBus = {
    name: 'org.gnome.GConf.Database',
    methods: [
        {
            name: 'Lookup',
            inSignature: 'ssb',
            outSignature: 'is'
        }
    ]
}

const TerminalSearchProvider = new Lang.Class({
    Name: 'TerminalSearchProvider',
    Extends: Search.SearchProvider,

    _init: function() {
        this.parent(_(NAME));
        this._appSys = Shell.AppSystem.get_default();
        this._terminal_app = this._appSys.lookup_app(GNOME_TERMINAL + '.desktop');
        this._profileList = [];

        // setup dbus
        let gconfProxy = DBus.makeProxyClass(GConfDBus);
        this._gconfControl = new gconfProxy(DBus.session,
                                            'org.gnome.GConf',
                                            '/org/gnome/GConf/Database/0');
    },

    enable: function() {
        this._debug('enabling');
        this._refreshProfileList();
        Main.overview.addSearchProvider(this);
    },

    disable: function() {
        this._debug('disabling');
        Main.overview.removeSearchProvider(this);
    },

    _log: function(msg) {
        global.log(NAME + ': ' + msg);
    },

    _debug: function(msg) {
        if (!DEBUG) {
            return;
        }
        this._log(msg);
    },

    _refreshProfileList: function() {
        this._debug('reloading profiles via gconf-dbus...');
        this._gconfControl.LookupRemote('/apps/gnome-terminal/global/profile_list',
                                        'en_US.UTF-8', true,
                                        Lang.bind(this, this._handleProfileListLookup));
    },

    _handleProfileListLookup: function(result, err) {
        if (err != null) {
            this._log(err);
            return;
        }
        if (result == null || result.length == null || result.length < 2 ||
            result[1].length == null || result[1].length < 2 || result[1][1].length == null) {
            this._log('bad result from gconf: ' + result);
            return;
        }
        let profileKeys = result[1][1];

        // clear whatever profile list we have now
        this._profileList = [];
        for (let i = 0; i < profileKeys.length; i++) {
            this._gconfControl.LookupRemote(
                '/apps/gnome-terminal/profiles/' + profileKeys[i] + '/visible_name',
                'en_US.UTF-8', true,
                Lang.bind(this,
                          function(result, err) {
                              if (err != null) {
                                  this._log(err);
                                  return;
                              }
                              this._profileList.push({
                                  'name': result[1],
                                  'lowerName': result[1].toLowerCase(),
                                  'weight': 0
                              });
                          }));
        }
    },

    getInitialResultSet: function(terms) {
        this._debug('getInitialResultSet: ' + terms);

        // first, find all profiles that match
        let weightedResults = [];
        for(let p = 0; p < this._profileList.length; p++) {
            let profile = this._profileList[p];
            for(let t = 0; t < terms.length; t++) {
                profile.weight = 0;
                let index = profile.lowerName.indexOf(terms[t].toLowerCase());
                if (index == 0) {
                    profile.weight += 2;
                } else if (index > 0) {
                    profile.weight += 1;
                }
            }

            // weight of 0 means no match
            if (profile.weight > 0) {
                weightedResults.push(profile);
            }
        }

        // next, sort the list
        let results = [];
        weightedResults.sort(function(a, b) {
            return b.weight - a.weight;
        });
        return weightedResults;
    },

    getSubsearchResultSet: function(previousResults, terms) {
        this._debug('getSubsearchResultSet: ' + terms);

        return this.getInitialResultSet(terms);
    },

    getResultMetas: function(profiles) {
        this._debug('getResultMetas');

        let metas = [];
        let terminal_app = this._terminal_app;
        for (let i = 0; i < profiles.length; i++) {
            let profile = profiles[i];
            metas.push({ 'id': profile,
                         'name': profile.name,
                         'createIcon': function(size) {
                             return terminal_app.create_icon_texture(size);
                         }
            });
        }
        return metas;
    },

    activateResult: function(profile) {
        Util.spawn([GNOME_TERMINAL, '--profile', profile.name]);
    }
});

function init() {
    return new TerminalSearchProvider();
}
