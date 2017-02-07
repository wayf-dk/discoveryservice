'use strict';

/**
    ds is a javascript object that handles the client side logic of the WAYF discovery service

*/

window.ds = function (wayfhub, brief, show, logtag, prefix) {
    show = show || 100;
    var diskofeed = location.protocol + '//' + location.hostname + prefix + 'dsbackend';
    var starttime = new Date();
    var urlParams = this.urlParams = parseQuery(window.location.search);
    var dry = Boolean(urlParams['dry']);
    var entityid = urlParams.entityID;

    var wayfhack = entityid == wayfhub;
    var feds = [];
    var superfeds = [];

    //var feds = ['WAYF'];
    var idplist = [];
    var maxrememberchosen = 10;
    var searchInput = document.getElementById("searchInput");

    var cache = {};
    var cursorKeysUsed = false;
    var touch = "ontouchstart" in document.documentElement;

    document.documentElement.className += touch ? ' touch' : ' no-touch';

    //searchInput.value = localStorage.query || "";
    //searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;

    var chosen = JSON.parse(localStorage.entityID || "[]");
    var relevantchosen = [];
    var lastchosen = parseInt(localStorage.lastchosen || '0');
    var selectable = 0;
    var requestcounter = 0;

    // automatically jumps to the bottom of the page for a better mobile experience
    // window.scroll(0, document.body.scrollHeight);


    if (wayfhack) {
        // WAYF specific hack to get to the original SP
        var returnurl = document.createElement('a');
        returnurl.href = urlParams['return'];
        var authid = parseQuery(returnurl.search)['AuthID'];
        if (authid) {
            returnurl.href = authid.split(':').slice(1).join(':');
            entityid = parseQuery(returnurl.search)['spentityid'];
        }
        // and limit candidates to IdPs behind the hub
        superfeds = ['HUBIDP'];
    }

    var delay = function () {
        var timer = 0;
        return function (callback, ms) {
            clearTimeout(timer);
            timer = setTimeout(callback, ms);
        };
    }();

    searchInput.addEventListener("input", function () {
        delay(search, 200);
    }, false);
    document.getElementById("chosenlist").addEventListener("click", choose, false);
    document.getElementById("foundlist").addEventListener("click", choose, false);
    document.getElementsByTagName("body")[0].addEventListener("keydown", enter, false);
    window.addEventListener("beforeunload", windowclose);

    search();

    this.changelang = function () {
        lang = {
            da: 'en',
            en: 'da'
        }[lang];
        search();
        searchInput.focus();
    };

    /**
        setselectable handles setting the idp that is selectable using the enter/return key
     */

    function setselectable(no, absolute) {
        // no == -1 prev, 0 1st in list, 1 next, null 1st in filtered list
        absolute = absolute || false;
        var list = selectable >= chosen.length ? 'foundlist' : 'chosenlist';
        var sel = document.getElementById(list).children[selectable];
        if (sel != null && sel.firstChild != null) {
            // ie 9 classList.remove
            sel.className = sel.className.split(' ').filter(function (v) {
                return v != 'selected';
            }).join(' ');
        }

        if (no == null) {
            // after search set to 1st in filtered list
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

        //while (selectable < chosen.length && document.getElementById('chosenlist').children[selectable].className.match(/\bdisabled\b/)) { selectable++; }

        list = selectable >= chosen.length ? 'foundlist' : 'chosenlist';
        sel = document.getElementById(list).children[selectable];
        if (sel && sel.firstChild != null) {
            // ie 9 compat add
            sel.className = sel.className.split(' ').concat('selected').join(' ');
        }
    }

    /**
        choose handles the actual selection of the idp either by a click or by the enter/return key
     */

    function choose(e) {
        var no,
            target,
            last = null;
        var choseby = 'click';
        searchInput.focus();

        var list = selectable >= chosen.length ? 'foundlist' : 'chosenlist';
        if (e == null) {
            // enter pressed
            var list = target = document.getElementById(list).children[selectable].firstChild;
            choseby = 'enter';
        } else {
            target = e.target;
        }
        no = target.attributes.getNamedItem("data-no");
        if (no == null) {
            // not an IdP element - might be a chosen wrapper
            if (target.classList.contains("chosen")) {
                // delete one already chosen
                var tobedeleted = parseInt(target.firstChild.attributes.getNamedItem("data-no").value);
                chosen = chosen.filter(function (e, i) {
                    return tobedeleted != i;
                });
            } else {
                return;
            }
        } else {
            // return with selected IdP
            no = parseInt(no.value);

            var prevchosen = chosen.some(function (item) {
                return idplist[no].entityID == item.entityID;
            });

            if (!prevchosen) {
                // new
                chosen.unshift(idplist[no]);
                chosen = chosen.slice(0, maxrememberchosen);
                last = 0;
            } else {
                last = no;
            }

            localStorage.lastchosen = last;
        }

        localStorage.entityID = JSON.stringify(chosen);

        if (no == null) {
            // update display
            selectable = Math.max(0, Math.min(chosen.length - 1, selectable));
            localStorage.lastchosen = selectable;
            search();
            setselectable(selectable, true);
        } else {
            // return with result
            // we don't want to get the window close event if we leave as a result of the users choise
            window.removeEventListener("beforeunload", windowclose);

            var entityID = idplist[no].entityID;

            if (wayfhack) {
                entityID = entityID.replace(/birk\.wayf\.dk\/birk\.php\//, '');
                entityID = entityID.replace(/^urn:oid:1.3.6.1.4.1.39153:42:/, '');
            }
            var displayName = idplist[no].DisplayNames[lang] || idplist[no].DisplayNames.en;
            var idp = idplist[no].entityID;
            if (wayfhack) {
                idp = idp.replace(/birk\.wayf\.dk\/birk\.php\//, '');
            };

            var query = {
                idp: idp,
                logtag: logtag,
                delta: new Date() - starttime,
                choseby: choseby,
                cursorKeysUsed: cursorKeysUsed,
                touch: touch,
                prevchosen: prevchosen
            };
            var request = new XMLHttpRequest();
            request.open("GET", location.protocol + '//' + location.hostname + '/dstiming' + serialize(query), true);
            request.send();
            if (dry) {
                alert('You are being sent to ' + displayName + ' (' + idp + ')');
                window.location = window.location;
            } else {
                window.location = '' + urlParams['return'] + '&' + urlParams['returnIDParam'] + '=' + encodeURIComponent(idp) + '';
            }
        }
    }

    function windowclose(e) {
        var query = {
            logtag: logtag,
            delta: new Date() - starttime,
            choseby: 'windowclose',
            touch: touch
        };
        var request = new XMLHttpRequest();
        request.open("GET", location.protocol + '//' + location.hostname + '/dstiming' + serialize(query), true);
        request.send();
    }

    /**
        discoverybackend handles the communication with the discovery backend
     */

    function discoverybackend(first, entityID, query, start, end, feds, callback) {
        var async = Boolean(callback);
        var request = new XMLHttpRequest();
        var urlvalue = {
            entityID: first ? entityID : '',
            query: query,
            start: start,
            end: end,
            lang: lang,
            feds: feds,
            superfeds: superfeds,
            logtag: logtag,
            delta: new Date() - starttime,
            chosen: first ? chosen.map(function (x) {
                return x.entityID;
            }) : ''
        };

        var param = serialize(urlvalue);

        // add entityID + lang for getting the name of the sp in the correct language
        // if no language the maybe don't return icon and name ???
        request.open("GET", diskofeed + param, async);
        request.send();
        if (async) {
            request.onreadystatechange = function () {
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
            foundlist: query || !brief || dsbe.rows == dsbe.found ? dsbe.idps : []
        };

        var no = 0;
        Object.keys(lists).forEach(function (k) {
            var rows = [];
            for (var i = 0; i < lists[k].length; i++) {
                var classs = k == 'chosenlist' ? 'chosen' : 'unchosen';
                var name = lists[k][i].DisplayNames[lang];
                if (!name) name = lists[k][i].DisplayNames.en;
                var entityID = lists[k][i].entityID;
                classs += k == 'chosenlist' && !relevantchosen[entityID] ? ' disabled' : '';
                var title = JSON.stringify(lists[k][i].Keywords).slice(1, -1);
                idplist[no] = {
                    DisplayNames: lists[k][i].DisplayNames,
                    entityID: entityID,
                    Keywords: lists[k][i].Keywords
                };
                rows[i] = '<div class="' + classs + ' metaentry"><div title="' + title + '" class="idp" data-no="' + no + '">' + name + '</div><span title="Press enter to select">⏎</span></div>';
                no++;
            }
            // fakedivs to make the selected work across the lists
            var fakedivs = k == 'foundlist' ? Array(lists['chosenlist'].length + 1).join('<div></div>') : '';
            document.getElementById(k).innerHTML = fakedivs + rows.join('');
        });
    }

    /**
        search handles the search - is called when the search input field changes
     */

    function search() {
        var query = searchInput.value.trim();

        discoverybackend(!requestcounter, entityid, query, 0, show, feds, function (dsbe) {
            if (!dsbe.spok) {
                display(dsbe.displayName, dsbe.rows, dsbe.found, true);
                return;
            }

            if (!requestcounter) {
                spIcon.src = dsbe.logo || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                //spIcon.style.display = "block";
                cache.spName = dsbe.displayName || entityid;
                relevantchosen = dsbe.chosen;
            }

            renderrows(dsbe, query);
            feds = dsbe.feds; // when we start using ad-hoc feds

            requestcounter++;
            display(cache.spName, dsbe.rows, dsbe.found);
            document.getElementById('found').style.display = idplist.length > chosen.length ? 'block' : 'none';
            document.getElementById('refine').style.display = (query || !brief) && dsbe.rows < dsbe.found ? 'block' : 'none';
            setselectable(query == "" ? lastchosen : null, true);
        });
    }

    /**
        enter handles keypresses
     */

    function enter(e) {
        // eslint-disable-line no-unused-vars
        var keyCodeMappings = {
            13: "enter",
            27: "escape",
            38: "up",
            40: "down"
        };

        var keyPressed = keyCodeMappings[e.keyCode];
        var top;

        if (e.defaultPrevented) {
            return; // Should do nothing if the key event was already consumed.
        }

        switch (keyPressed) {
            case "down":
                setselectable(1);
                cursorKeysUsed = true;
                break;
            case "up":
                setselectable(-1);
                cursorKeysUsed = true;
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
        encode query from object - from http://stackoverflow.com/questions/1714786/querystring-encoding-of-a-javascript-object
     */

    function serialize(obj) {
        return '?' + Object.keys(obj).reduce(function (a, k) {
            a.push(k + '=' + encodeURIComponent(obj[k]));return a;
        }, []).join('&');
    }

    /**
        parseQuery converts the url query params to a map
     */

    function parseQuery(query) {
        var urlParams = {};
        var match;
        var pl = /\+/g; // Regex for replacing addition symbol with a space
        var re = /([^&=]+)=?([^&]*)/g;
        var decode = function decode(s) {
            return decodeURIComponent(s.replace(pl, " "));
        };
        query = query.replace(/^\?/, '');
        while (match = re.exec(query)) {
            // eslint-disable-line no-cond-assign
            urlParams[decode(match[1])] = decode(match[2]);
        }

        return urlParams;
    }
};