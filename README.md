# discoveryservice

Discoveryservice is a SAML IdP discoveryservice that:

- is a service with a javascript frontend an a php backend
- uses a compressed server generated static json document - in shibboleth-embedded-ds format - for info on the IdPs
- favors prifix searching for IdPs by (domain)names and keywords
- can be used as a central or decentral service
- uses MDQ to get access to SP metadata for names and logos etc.
- has support for filtering of displayed IdPs eg. by federation
- is currently under development at WAYF and will be used as our primary disco service in the spring of 2107
