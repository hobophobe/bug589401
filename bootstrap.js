/* ***** BEGIN LICENSE BLOCK *****
 * Version: MIT/X11 License
 * 
 * Copyright (c) 2011 Adam Dane
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Contributor(s):
 *   Adam Dane <unusualtears@gmail.com> (Original Author) 
 *
 *   Code from Restartless Restart extension (under the MIT/X11 license):
 *     Erik Vold <erikvvold@gmail.com>
 *     Greg Parris <greg.parris@gmail.com>
 *     Nils Maier <maierman@web.de>
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

let tabViewDragObserver = {
  hiddenItems: [],
  canDrop: function TabView_canDrop(event) {
    var types = [
      "application/x-moz-tabbrowser-tab",
      PlacesUtils.TYPE_X_MOZ_PLACE,
      PlacesUtils.TYPE_X_MOZ_URL,
      PlacesUtils.TYPE_UNICODE,
      "text/plain"
    ];
    return types.some(function (type) {
      if (event.dataTransfer.types.contains(type)) {
        if (type === PlacesUtils.TYPE_UNICODE ||
            type === "text/plain") {
          try {
            makeURI(event.dataTransfer.mozGetDataAt(type, 0));
          }
          catch (ex) {
            // Text data was not a URI.
            return false;
          }
        }
        else if (type === "application/x-moz-tabbrowser-tab") {
          let tab = event.dataTransfer.mozGetDataAt(type, 0);
          if (!tab._tabViewTabItem) {
            return false;
          }
        }
        return true;
      }
      return false;
    });
  },

  onDragOver: function TabView_onDragOver(event) {
    if (tabViewDragObserver.canDrop(event)) {
      let hideTabItems = [];
      let count = event.dataTransfer.mozItemCount;
      const tabType = "application/x-moz-tabbrowser-tab";
      for (let i = 0; i < count; i++) {
        if (event.dataTransfer.mozTypesAt(i).contains(tabType)) {
          let tab = event.dataTransfer.mozGetDataAt(tabType, i);
          if (!tab._tabViewTabItem) {
            continue;
          }
          tabViewDragObserver.hiddenItems.push(tab._tabViewTabItem);
          tab._tabViewTabItem.setHidden(true);
        }
      }
      return event.preventDefault();
    }
    return false;
  },

  onDragLeave: function TabView_onDragLeave(event) {
    while (tabViewDragObserver.hiddenItems.length) {
      tabViewDragObserver.hiddenItems.pop().setHidden();
    }
  },

  onDragDrop: function TabView_onDragDrop(event) {
    while (tabViewDragObserver.hiddenItems.length) {
      tabViewDragObserver.hiddenItems.pop().setHidden();
    }
    var items = [],
        copy = (event.dataTransfer.dropEffect === "copy"),
        count = event.dataTransfer.mozItemCount,
        i,
        j,
        target = event.target,
        data,
        group,
        types = [
          "application/x-moz-tabbrowser-tab",
          PlacesUtils.TYPE_X_MOZ_PLACE,
          PlacesUtils.TYPE_X_MOZ_URL,
          PlacesUtils.TYPE_UNICODE,
          "text/plain"
        ],
        type;

    while (target != null) {
      if (target.id && target.id == "content") {
        group = event.target.ownerDocument.defaultView.GroupItems.newGroup();
        break;
      }
      else if (target.iQData) {
        if (target.iQData.item.isAGroupItem) {
          group = target.iQData.item;
          break;
        }
        else if (target.iQData.item.isATabItem) {
          group = target.iQData.item.parent;
          break;
        }
        else {
          // Not sure, but don't think this can happen?
          target = target.parentNode;
        }
      }
      target = target.parentNode;
    }
    if (!group) {
      // Should not happen: should be new group if a group isn't found.
      return false;
    }
    for (i = 0; i < count; i += 1) {
      // Order matters: can't use Array.some()
      for (j = 0; j < types.length; j += 1) {
        type = types[j];
        if (event.dataTransfer.mozTypesAt(i).contains(type)) {
          data = event.dataTransfer.mozGetDataAt(type, i);
          if (data) {
            items.push([data, type, copy]);
            break;
          }
        }
      }
    }
    items.forEach(function (item) {
      // item[] is [data, type, copy], copy only used for tabs
      let [data, type, copy] = item;
      switch (type) {
      case "application/x-moz-tabbrowser-tab":
        if (copy) {
          group.newTab(data.linkedBrowser.currentURI.spec);
        }
        else {
          group.add(data._tabViewTabItem.$container);
          data._tabViewTabItem.zoomIn();
        }
        break;
      case PlacesUtils.TYPE_X_MOZ_PLACE:
        data = PlacesUtils.unwrapNodes(data, type)[0];
        switch (data.type) {
        case PlacesUtils.TYPE_X_MOZ_PLACE:
          group.newTab(data.uri);
          break;
        case PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER:
          // (no handling, for now)
        case PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR:
           // (no handling)
           break;
        default:
        }
        break;
      case PlacesUtils.TYPE_X_MOZ_URL:
        // data is "uri\ntitle"
        data = data.split('\n')[0];
      case PlacesUtils.TYPE_UNICODE:
      case "text/plain":
        group.newTab(data);
        break;
      default:
      }
    });
    return event.preventDefault();
  }
};

function showOnDragOver(event) {
  if (tabViewDragObserver.canDrop(event)) {
    let doc = event.target.ownerDocument;
    doc.defaultView.TabView.show();
    return event.preventDefault();
  }
  return false;
}

function hideOnDragOver(event) {
  event.target.ownerDocument.defaultView.gTabView.hide();
  tabViewDragObserver.onDragLeave(event);
  return event.preventDefault();
}


function attachToTabView(event) {
  let win = this.defaultView.TabView._window;
  win.addEventListener("dragover", tabViewDragObserver.onDragOver, false);
  win.addEventListener("dragdrop", tabViewDragObserver.onDragDrop, false);
}

function detachFromTabView(event) {
  let inWin = this.defaultView.TabView._window;
  let tvdo = tabViewDragObserver;
  inWin.removeEventListener("dragover", tvdo.onDragOver, false);
  inWin.removeEventListener("dragdrop", tvdo.onDragDrop, false);
}

(function(global) global.include = function include(src) (
    Services.scriptloader.loadSubScript(src, global)))(this);

function attachOnEnable (win) {
  attach(win);
}

function attach (win) {
  let doc = win.document;
  doc.addEventListener("tabviewshown", attachToTabView, false);
  doc.addEventListener("tabviewhidden", detachFromTabView, false);
  let button = doc.getElementById("tabview-button");
  if (button) {
    button.addEventListener("dragover", showOnDragOver, false);
    unload(function() { clean(button, win); }, win);
  }
}

function clean (button, window) {
  button.removeEventListener("dragover", showOnDragOver, false);
  window.TabView.removeEventListener("tabviewshown", attachToTabView, false);
  window.TabView.removeEventListener("tabviewhidden", detachFromTabView, false);
}

function startup (data, reason) {
  AddonManager.getAddonByID(data.id, function(addon) {
    include(addon.getResourceURI("includes/utils.js").spec);
    if (reason === ADDON_ENABLE) {
      watchWindows(attachOnEnable);
    }
    else {
      watchWindows(attach);
    }
  });
}

function shutdown (data, reason) {
  if (reason !== APP_SHUTDOWN) unload();
}

function install (data, reason) {
}

function uninstall (data, reason) {
}
