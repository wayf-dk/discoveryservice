/**
    ds is a javascript object that handles the client side logic of the WAYF discovery service

*/

window.ds = function(wayfhub, brief, show, logtag) {
    show = show || 100;
    var diskofeed = `https://${location.hostname}/dsbackend?`;
    var starttime = new Date();
    var urlParams = this.urlParams = parseQuery(window.location.search);
    var dry = Boolean(urlParams['dry']);

    var wayfhack = urlParams.entityID == wayfhub;
    //var feds = urlParams['feds'] ? urlParams.feds.split(/,+/) : [];
    var feds = window.location.pathname.split(/\W/).filter(function(v) {
        return v;
    }) || ['WAYF'];
    var idplist = [];
    var maxrememberchosen = 3;
    var searchInput = document.getElementById("searchInput");

    var cache = {};
    document.documentElement.className += (("ontouchstart" in document.documentElement) ? ' touch' : ' no-touch');

    //searchInput.value = localStorage.query || "";
    //searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;

    var chosen = JSON.parse(localStorage.entityID || "[]");
    var lastchosen = Number.parseInt(localStorage.lastchosen || '0');
    var selectable = 0;
    var requestcounter = 0;

    // automatically jumps to the bottom of the page for a better mobile experience
    // window.scroll(0, document.body.scrollHeight);

    var entityid = urlParams.entityID;

    if (wayfhack) {
        // WAYF specific hack to get to the original SP
        var authid = parseQuery(new URL(urlParams['return']).search)['AuthID'];
        if (authid) {
            authid = authid.split(':').slice(1).join(':');
            entityid = parseQuery(new URL(authid).search)['spentityid'];
        }
    }

    var delay = (function() {
        var timer = 0;
        return function(callback, ms) {
            clearTimeout(timer);
            timer = setTimeout(callback, ms);
        };
    })();

    searchInput.addEventListener("input", function() {
        delay(search, 200);
    }, false);
    document.getElementById("chosenlist").addEventListener("click", choose, false);
    document.getElementById("foundlist").addEventListener("click", choose, false);
    document.getElementsByTagName("body")[0].addEventListener("keydown", enter, false);

    search();

    this.changelang = function() {
        lang = {
            da: 'en',
            en: 'da'
        }[lang];
        search();
        searchInput.focus();
    }

    /**
        setselectable handles setting the idp that is selectable using the enter/return key

    */

    function setselectable(no, absolute) { // no == -1 prev, 0 1st in list, 1 next, null 1st in filtered list
        absolute = absolute || false;
        var list = selectable >= chosen.length ? 'foundlist' : 'chosenlist';
        var sel = document.getElementById(list).children[selectable];
        if (sel != null && sel.firstChild != null) {
            sel.firstChild.className = "idp";
            sel.classList.remove("selected");
        }

        if (no == null) { // after search set to 1st in filtered list
            selectable = chosen.length;
            no = 1;
        } else if (absolute) {
            selectable = no;
        } else {
            selectable += no; // move forth or back
        }

        if (selectable < 0 || no == 0) {
            selectable = 0;
        } // if at start or before - move to 1st line
        //if (selectable == chosen.length && chosen.length > 0) { selectable += no; } // if at delimiterline move one forth or back
        if (selectable >= idplist.length) {
            selectable = 0;
        } // if at end move to start

        list = selectable >= chosen.length ? 'foundlist' : 'chosenlist';
        sel = document.getElementById(list).children[selectable];
        if (sel && sel.firstChild != null) {
            sel.classList.add("selected");
            sel.firstChild.className = "idp";
        }
    }

    /**
        choose handles the actual selection of the idp either by a click or by the enter/return key

    */

    function choose(e) {
        var no, target, last = null;
        var list = selectable >= chosen.length ? 'foundlist' : 'chosenlist';
        if (e == null) { // enter pressed
            var list =
                target = document.getElementById(list).children[selectable].firstChild;
        } else {
            target = e.target;
        }
        no = target.attributes.getNamedItem("data-no");
        if (no == null) { // not an IdP element - might be a chosen wrapper
            if (target.classList.contains("chosen")) { // delete one already chosen
                tobedeleted = parseInt(target.firstChild.attributes.getNamedItem("data-no").value);
                chosen = chosen.filter(function(e, i) {
                    return tobedeleted != i;
                });
            } else {
                return;
            }
        } else { // return with selected IdP
            no = parseInt(no.value);

            var prevchosen = chosen.findIndex(function(item) {
                return idplist[no].entityID == item.entityID;
            });

            if (prevchosen == -1) { // new
                chosen.unshift(idplist[no]);
                chosen = chosen.slice(0, maxrememberchosen);
                last = 0;
            } else {
                last = no;
            }

            localStorage.lastchosen = last;
        }

        localStorage.entityID = JSON.stringify(chosen);

        if (no == null) { // update display
            selectable = Math.max(0, Math.min(chosen.length - 1, selectable));
            localStorage.lastchosen = selectable
            search();
            setselectable(selectable, true);
        } else { // return with result
            var entityID = idplist[no].entityID;

            if (wayfhack) {
                entityID = entityID.replace(/birk\.wayf\.dk\/birk\.php\//, '')
                entityID = entityID.replace(/^urn:oid:1.3.6.1.4.1.39153:42:/, '')
            }
            var displayName = idplist[no].DisplayNames[lang] || idplist[no].DisplayNames.en;
            var idp = idplist[no].entityID;
            if (wayfhack) {
                idp = idp.replace(/birk\.wayf\.dk\/birk\.php\//, '')
            };
            var encodedidp = encodeURIComponent(idp);
            var request = new XMLHttpRequest();
            var delta = new Date() - starttime
            request.open("GET", `https://${location.hostname}/dstiming?logtag=${logtag}&delta=${delta}&idp=${encodedidp}`, true);
            request.send();
            if (dry) {
                alert(`You are being sent to ${displayName} (${idp})`);
                window.location = window.location;
            } else {
                window.location = `${urlParams['return']}&${urlParams['returnIDParam']}=${encodedidp}`;
            }
        }
    }

    /**
        discoverybackend handles the communication with the discovery backend

    */

    function discoverybackend(entityID, query, start, end, feds, callback) {
        var async = Boolean(callback);
        var request = new XMLHttpRequest();
        var urlvalue = {
            entityID: entityID,
            query: query,
            start: start,
            end: end,
            lang: lang,
            feds: feds,
            logtag: logtag,
            delta: new Date() - starttime
        };

        var param = Object.entries(urlvalue).map(function(v) {
            return v[0] + '=' + encodeURIComponent(v[1]);
        }).join('&');

        // add entityID + lang for getting the name of the sp in the correct language
        // if no language the maybe don't return icon and name ???
        request.open("GET", diskofeed + param, async);
        request.send();
        if (async) {
            request.onreadystatechange = function() {
                if (request.readyState == XMLHttpRequest.DONE) {
                    if (request.status >= 200 && request.status < 400) {
                        callback(JSON.parse(request.responseText));
                    } else {
                        callback(JSON.parse(request.responseText));
                    }
                }
            };
        } else {
            var res = JSON.parse(request.responseText);
            return res;
        }
    }

    /**
        renderrows handles the rendering of the previously chosen idps as well as the search result

    */

    function renderrows(dsbe, query) {
        idplist = [];
        var lists = {
            chosenlist: chosen,
            foundlist: query || !brief ? dsbe.idps : [],
        }

        var no = 0;
        Object.keys(lists).forEach(function(k) {
            var rows = [];
            for (var i = 0; i < lists[k].length; i++) {
                var classs = k == 'chosenlist' ? 'chosen' : 'unchosen';
                var name = lists[k][i].DisplayNames[lang];
                if (!name) name = lists[k][i].DisplayNames.en;
                var entityID = lists[k][i].entityID;
                var title = JSON.stringify(lists[k][i].Keywords).slice(1, -1);
                idplist[no] = {
                    DisplayNames: lists[k][i].DisplayNames,
                    entityID: entityID,
                    Keywords: lists[k][i].Keywords
                };
                rows[i] = `<div class="${classs} metaentry"><div title="${title} ${no}" class="idp" data-no="${no}">${name}</div><span title="Press enter to select">⏎</span></div>`;
                no++;
            }
            // fakedivs to make the selected work across the lists
            var fakedivs = k == 'foundlist' ? '<div></div>'.repeat(lists['chosenlist'].length) : '';
            document.getElementById(k).innerHTML = fakedivs + rows.join('');
        });
    }

    /**
        search handles the search - is called when the search input field changes

    */

    function search() {
        var query = searchInput.value.trim();

        discoverybackend(requestcounter ? '' : entityid, query, 0, query || !brief ? show : -1 , feds, function(dsbe) {
            renderrows(dsbe, query);
            feds = dsbe.feds;

            if (!requestcounter) {
                spIcon.src = dsbe.logo;
                //spIcon.style.display = "block";
                cache.spName = dsbe.displayName || entityid;
            }
            requestcounter++;
            display(cache.spName, query || !brief ? dsbe.rows : 0, dsbe.found);
            document.getElementById('found').hidden = idplist.length > chosen.length ? false : true;
            document.getElementById('refine').hidden = (query || !brief) && dsbe.rows < dsbe.found ? false : true;
            setselectable(query == "" ? lastchosen : null, true);
        });
    }

    /**
        enter handles keypresses

    */

    function enter(e) { // eslint-disable-line no-unused-vars
        var keyCodeMappings = {
            13: "enter",
            27: "escape",
            38: "up",
            40: "down",
        };

        var keyPressed = keyCodeMappings[e.keyCode];
        var top;

        if (e.defaultPrevented) {
            return; // Should do nothing if the key event was already consumed.
        }

        switch (keyPressed) {
            case "down":
                setselectable(1);
                break;
            case "up":
                setselectable(-1);
                break;
            case "enter":
                choose(null);
                break;
            case "escape":
                searchInput.value = "";
                search();
                break;
            default:
                return; // Quit when this doesn't handle the key event.
        }
        e.preventDefault();
    }

    /**
        parseQuery converts the url search params to a map

    */

    function parseQuery(query) {
        var urlParams = {};
        var match;
        var pl = /\+/g; // Regex for replacing addition symbol with a space
        var re = /([^&=]+)=?([^&]*)/g;
        var decode = function(s) {
            return decodeURIComponent(s.replace(pl, " "));
        };
        query = query.replace(/^\?/, '');
        while (match = re.exec(query)) { // eslint-disable-line no-cond-assign
            urlParams[decode(match[1])] = decode(match[2]);
        }

        return urlParams;
    }
};