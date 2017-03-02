# discoveryservice

Discoveryservice is a SAML IdP discoveryservice that:

- is a service with a javascript frontend and a php backend
- uses a compressed server generated static json document - in shibboleth-embedded-ds format - for info on the IdPs
- favors prifix searching for IdPs by (domain)names and keywords
- can be used as a central or decentral service
- uses (local)MDQ to get access to SP metadata for names and logos etc.
- has support for filtering of displayed IdPs eg. by federation
- is currently under development at WAYF and is used as our primary disco service

If you want to test it you should clone/download it and:
- add a “FallbackResource /index.php” in the Apache config for the site
- rename the ds.ini.template to ds.ini in the config directory

The only SP supported in demo mode is https://wayfsp.wayf.dk. So the query should be:

…?dry=1&entityID=https://wayfsp.wayf.dk

dry=1 makes it show an alert instead of using the normal required return parameter - DiscoveryResponse from SP metadata is not supported.
