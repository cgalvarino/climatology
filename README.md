#SECOORA CLIMATOLOGY

With the help of the SECOORA product committee members, the data mangers at UNC-Wilmington and USF, the Ocean Observing and Modeling Group at NCSU, and the SECOORA DMAC team, we are pleased to announce the release of the SECOORA Climatology product.  This release allows users to interact and download historical surface temperature and salinity data from select SECOORA buoys and model results from 2011 - 2014.  We hope that it will serve as a launching pad for further development, including the addition of more in-situ observations and model outputs, and perhaps foster discussion to determine other ways historical data may be shared in a meaningful way with the ocean community.

##Architecture
The THREDDS data sources for this application are defined in `catalog.js`.  Currently there are two flavors:  model output and in -situ time series.  This file also defines the temporal options as well as the initial application state.

This application offers daily and monthly averages which are handled differently for model output and in-situ observations.  The model output has unique TDS endpoints depending on the variable and temporal averaging period.  In-situ, however, has one TDS endpoint for each variable, and all averaging is done in the client's browser.

##Evolution
This application is based on work done by NERACOOS, specifically their [NERACOOS Ocean and Weather Climate Display](http://neracoos.org/datatools/climatologies) application.  The SECOORA endeavor attempts to provide access to both in-situ as well as model outputs in one interface.  As long as a TDS dataset is adequately defined in the catalog, it should be a candidate for inclusion.

Members of the SECOORA community have seen value in this application by customizing it o meet local needs.  For example, data providers may show both model and in-situ on one graph for visual confirmation that all systems are OK or for a visual aid to track down data outliers.

##Feedback
It is our hope that this application is forked and is useful for ocean enthusiasts at large.  We welcome your feedback, and feel free to add issues here on GitHub.  If you prefer to contact the SECOORA team directly, email [communications@secoora.org](mailto:communications@secoora.org).
