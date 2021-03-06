<?php
//ini_set('display_errors', 1);
//error_reporting(E_ALL);

spl_autoload_register();

dsbe::dispatch(parse_ini_file('../config/ds.ini'));

class dsbe {

    static $config;

    /**
        Due to a FallBack resource in the Apache configuration all request passes thru this script.
        dispatch calls the handler based on the path
        In this case the std ui is used if none of the web exported functions__ in this class is called

    */

    static function dispatch($config)
    {
        self::$config = $config;

        $path = preg_split("/[\?]/", $_SERVER['REQUEST_URI'], 0, PREG_SPLIT_NO_EMPTY);
        $path = (array)preg_split("/[\/]/", $path[0], 0, PREG_SPLIT_NO_EMPTY);
        $scriptnamepath = array_slice(preg_split("/[\/]/", $_SERVER['PHP_SELF'], 0, PREG_SPLIT_NO_EMPTY), 0, -1);

        $pathindex = sizeof($scriptnamepath);

        $cmd = isset($path[$pathindex]) ? $path[$pathindex] : '';

        $function = "self::$cmd" . '__';

        if (is_callable($function)) {
            extract(self::ex($_GET, 'logtag'));
            apache_note('logtag', $logtag);
            call_user_func($function, $path);
        } else {
            $logtag = uniqid();
            $prefix = '/' . join('/', $scriptnamepath) . ($pathindex > 0 ? '/' : '');
            apache_note('logtag', $logtag);
            require('../lib/DS.html');
        }
    }

    /**
        dsfallback is called by the client if the normal javascript executions fails

    */

    static function dsfallback__($path) {
        header("Location: https://wayf.wayf.dk/module.php/wayfdiscopower/disco.php?{$_SERVER['QUERY_STRING']}");
    }


    /**
        dstiming is an emtpy function, is is only here to allow the timing ajax from the frontend
        to enter the Apache log

    */

    static function dstiming__($path) {
    }

    /**
        dsbackend handles the search request from the frontend
        The 1st time it is called in a discovery "session" the query includes the entityID for the SP.
        This saves a roundtrip as the ad-hoc federations the SP belongs to can be extracted from the SP metadata and
        used directly in the search and returned to the client. For subsequent searches the client passes the federation list as a parameter.

    */

    static function dsbackend__($path) {
        extract(self::ex($_GET, 'entityID', 'query', 'start', 'end', 'lang', 'feds', 'superfeds', 'chosen', 'logtag'));
        $tobefound = $end - $start;
        $spmetadata = false;
        $cfg = self::$config;
        self::timer('start');
        $feds = $feds ? explode(',', $feds) : [];
        $superfeds = $superfeds ? explode(',', $superfeds) : [];
        $chosen = $chosen ? explode(',', $chosen) : [];
        $chosen = array_fill_keys($chosen, 0); // 0 and NOT false to be able to spot entities not active any longer

        $logo = $displayName = null;

        if ($entityID) {
            $spmetadatapath = $cfg['mdq'] . '{sha1}' .  sha1($entityID);
            $handle = @fopen($spmetadatapath, 'r');
            if (!$handle) { // try a 2nd time after clearing the realpath_cache - lMDQ might have changed the path
                clearstatcache(true);
                $handle = @fopen($spmetadatapath, 'r');
            }

            if ($handle) {
                $spmetadatstats = fstat($handle);
                $spmetadata = fread($handle, $spmetadatstats['size']);
                fclose($handle);

                $spxp = xp::xpFromString($spmetadata);
                $logo = $spxp->query("md:SPSSODescriptor/md:Extensions/mdui:UIInfo/mdui:Logo")->item(0);
                if ($logo) {
                    $logo = $logo->nodeValue;
                }

                foreach([$lang, 'en'] as $l) {
                    $displayName = $spxp->query("//mdui:DisplayName[@xml:lang='{$l}']")->item(0);
                    if ($displayName) {
                        $displayName = $displayName->nodeValue;
                        break;
                    }
                }

                if (sizeof($feds) == 0) {
                    $fedsxml = $spxp->query("md:Extensions/wayf:wayf/wayf:feds");
                    foreach ($fedsxml as $fed) {
                        $feds[] = $fed->nodeValue;
                    }
                }
                self::timer('md for sp');
            } else {
                error_log("dsbackend not found: $logtag $entityID");
            }
        }

        $spok = (bool) $entityID == (bool) $spmetadata;
        $displayName = $spok ? $displayName : htmlspecialchars($entityID);
       // $feds = ['kalmar2']; //, 'WAYF', 'eduGAIN'];

        $qs = [];
        $final = [];
        $found = $rows = 0;

        if ($end >= $start && $spok) {
            $idps = json_decode(gzdecode(file_get_contents($cfg['discofeed'])), 1);
            self::timer('read_ds');

            $chunksize = 200;
            $chunks = [];
            foreach ($idps as $i => $idp) {

                if (isset($chosen[$idp['entityID']])) {
                    $chosen[$idp['entityID']] = sizeof(array_intersect($idp['feds'], $feds)) > 0;
                }

                $chunk = (int) $i/$chunksize;
                if (empty($chunks[$chunk])) { $chunks[$chunk] = ''; };
                $chunks[$chunk] .= " " . $idp['Keywords'][0]['value'];
            }

            self::timer('chunk');


            $qqs = '';
            $queries = preg_split("/\s+/", strtolower(trim(latinise::str2latin($query))));
            foreach ($queries as $q) {
                $qs[] = "\\b" .  preg_quote(preg_replace("/[^\w\.\-\']/", "", $q));
            }

            $res = [];
            $qqs = "/(" . join(')|(', $qs) . ')/';
            foreach ($chunks as $no => $chunk) {
                if (!preg_match($qqs, $chunk)) { continue; }

                foreach(range(1,1) as $x) {
    //            foreach ($idps as $i => $idp) {

                $chunkstart = $no * $chunksize;
                $chunkend   = min($chunkstart + $chunksize, sizeof($idps));
                for ($i = $chunkstart; $i < $chunkend; $i++ ) {
                    $idp = $idps[$i];
                    $oksuperfeds = !$superfeds || ($superfeds && array_intersect($superfeds, $idp['feds']));
                    if (array_intersect($idp['feds'], $feds) && $oksuperfeds) {
                        $hits = 0;
                        foreach ($qs as $q) {
                            if (preg_match("/$q/", $idp['Keywords'][0]['value'])) {
                                $hits++;
                            }
                        }
                        if ($hits == sizeof($queries)) {
                            $res[] = $i;
                            $found++;
                        }
                    }
                }
                }
            }

            $res = array_slice($res, $start, $end - $start);
            $rows = sizeof($res);

            foreach($res as $i) {
                $displayNames = [];
                foreach($idps[$i]['DisplayNames'] as $dn) {
                    if (in_array($dn['lang'], ['da', 'en'])) { $displayNames[$dn['lang']] = $dn['value']; }
                }
    //             foreach ([$lang, 'en'] as $l) {
    //                 if (isset($displayNames[$l])) {
    //                     $idpName = $displayNames[$l];
    //                     break;
    //                 }
    //             }

                $final[] = ['entityID' => $idps[$i]['entityID'], 'DisplayNames' => $displayNames, 'Keywords' => $idps[$i]['Keywords'][0]['value']];
            }

            self::timer('search');
        }
        header('Content-Type: application/javascript');
        header('Content-Encoding: gzip');
        print gzencode(json_encode(['spok' => $spok, 'chosen' => $chosen, 'qs' => $qs, 'found' => $found, 'rows' => $rows, 'feds' => $feds, 'idps' => $final, 'logo' => $logo, 'displayName' => $displayName], JSON_PRETTY_PRINT));
        //self::timer();
    }

    /**
        Extract named parameters from array and make sure that a key is set for all ie. no isset() ...
        1st parameter is the array, rest is keynames

    */

    static function ex()
    {
        $args = func_get_args();
        $array = array_shift($args);
        $res = array();
        foreach($args as $arg) {
            if (isset($array[$arg])) { $res[$arg] = $array[$arg]; }
            else { $res[$arg] = null; }
        }
        return $res;
    }

    /**
        timer makes it simple to do some easy timing for different phases in the script

    */

    static function timer($event = false)
    {
        static $last = 0;
        static $first = 0;
        static $events = array();
        if ($event === false) {
            $events['eop'] = microtime(true) - $first;
            foreach($events as &$event) { $event = round($event, 4); }
            print "<div style=\"clear: left;\"><pre>"; print_r($events); print "</pre></div>"; return;
        }
        if ($last === 0) {
            $first = $last = microtime(true);
//            register_shutdown_function(['phphfrontend', 'timer'], false);
        }
        $now = microtime(true);
        if (empty($events[$event])) { $events[$event] = 0; }
        $events[$event] += $now - $last;
        $last = $now;
    }
}