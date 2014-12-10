CloudGallery
============

Cloud Gallery for Firefox OS. This is an experimental
implementation of a Gallery application for Firefox OS that can store images on the Cloud.
As a result, it allows to get access to your Gallery from any device which has a Web Browser.

The authentication mechanism is based on Facebook, which means that you need a
Facebook account to use it. As a bonus, you can publish images on your
gallery to a Facebook Album.

The backend service is implemented in Node.js. To store data
Redis is used as well as an Object Storage service provided by Telefónica.

This is an application made for experimentation purposes.
Your gallery maybe lost and the service is not guaranteed at all.

This application can only work while you are online. The application is expected to evolve
to support offline mode as well by making use of the
[CloudDatastore](https://github.com/jmcanterafonseca/CloudDatastore) technology, currently
under development.

Original ideas an implementation: José Manuel Cantera Fonseca (jmcf@tid.es)

Copyright (c) 2014 Telefónica Investigación y Desarrollo S.A.U.
