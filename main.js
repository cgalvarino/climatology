var plotData = [];
var lyrQuery;
var lyrCatalog = new OpenLayers.Layer.Vector();
var map;
var spinner;
var proj3857 = new OpenLayers.Projection("EPSG:3857");
var proj4326 = new OpenLayers.Projection("EPSG:4326");

function init() {
  $('#coords .btn-default').on('click',function() {
    $('#location').selectpicker('val','custom');
    $('#coords').modal('hide');
  });

  $('#time-series-graph').bind('plothover',function(event,pos,item) {
    if (item) {
      var x = new Date(item.datapoint[0]);
      var y = item.datapoint[1];
      if (prevPoint != item.dataIndex) {
        $('#tooltip').remove();
        var a = item.series.label ? item.series.label.match(/(\([^\)]*\))<\/a>/) : false;
        var u = '';
        if (a && a.length == 2) {
          var b = a.pop();
          u = b.substr(1,b.length - 2);
        }
        showToolTip(
           item.pageX
          ,item.pageY
          ,new Date(x).format('UTC:mmm dd, yyyy HH:00') + ' : ' + (Math.round(y * 100) / 100) + ' ' + u);
      }
      prevPoint = item.dataIndex;
    }
    else {
      $('#tooltip').remove();
      prevPoint = null;
    }
  });

  _.each(catalog.variables.sort(),function(o) {
    $('#vars').after($('</h4>')).append('<button type="button" data-value="' + o + '" class="btn btn-default">' + o + '</button> ');
  });
  $('#vars [data-value="' + defaults.var + '"]').removeClass('btn-default').addClass('btn-custom-lighten active');
  $('#vars button').click(function() {
    $(this).blur();
    var selVal = $(this).data('value');
    $('#vars button').each(function() {
      if ($(this).data('value') == selVal) {
        $(this).removeClass('btn-default').addClass('btn-custom-lighten').addClass('active');
      }
      else {
        $(this).removeClass('btn-custom-lighten').removeClass('active').addClass('btn-default');
      }
    });
    query();
  });

  _.each(catalog.years.sort(),function(o) {
    $('#years').after($('</h4>')).append('<button type="button" data-value="' + o + '" class="btn btn-default">' + o + '</button> ');
  });
  $('#years [data-value="' + defaults.year + '"]').removeClass('btn-default').addClass('btn-custom-lighten active');
  $('#years button').click(function() {
    $(this).blur();
    var selVal = $(this).data('value');
    $('#years button').each(function() {
      if ($(this).data('value') == selVal) {
        $(this).removeClass('btn-default').addClass('btn-custom-lighten').addClass('active');
      }
      else {
        $(this).removeClass('btn-custom-lighten').removeClass('active').addClass('btn-default');
      }
    });
    query();
  });

  var wkt = new OpenLayers.Format.WKT();
  var i = 1;
  _.each(_.sortBy(_.keys(catalog.sites),function(o){return o.toUpperCase()}),function(grp) {
    $('#location').append('<optgroup label="' + grp + '">');
    _.each(_.sortBy(_.keys(catalog.sites[grp]),function(o){return o.toUpperCase()}),function(site) {
      var selected = defaults.site == site ? 'selected="selected"' : '';
      $($('#location optgroup')[i]).append('<option value="' + site + '" ' + selected + '>' + site + '</option>');
      var f = wkt.read(catalog.sites[grp][site]['wkt']);
      f.geometry.transform(proj4326,proj3857);
      f.attributes = {
         'group' : grp
        ,'name'  : site
      };
      lyrCatalog.addFeatures([f]);
    });
    i++;
  });

  $('#location').change(function() {
    $(this).blur();
    var val = $(this).selectpicker().val();
    if (val == 'manual') {
      $('#coords')
        .bootstrapValidator({
           excluded      : [':disabled']
          ,feedbackIcons : {
            valid      : 'glyphicon glyphicon-ok',
            invalid    : 'glyphicon glyphicon-remove',
            validating : 'glyphicon glyphicon-refresh'
          }
          ,fields : {
            customLat : {
              validators : {
                notEmpty : {
                  message: 'This field is required.'
                }
                ,callback : {
                  callback : function(value,validator) {
                    return $.isNumeric(value);
                  }
                }
              }
            }
            ,customLon : {
              validators : {
                notEmpty : {
                  message: 'This field is required.'
                }
                ,callback : {
                  callback : function(value,validator) {
                    return $.isNumeric(value);
                  }
                }
              }
            }
          }
        })
        .on('shown.bs.modal', function() {
          $('#coords').bootstrapValidator('resetForm',true);
          $('#coords').find('[name="customLat"]').focus();
        })
        .on('error.validator.bv', function(e, data) {
          data.element
          .data('bv.messages')
          // Hide all the messages
          .find('.help-block[data-bv-for="' + data.field + '"]').hide()
          // Show only message associated with current validator
          .filter('[data-bv-validator="' + data.validator + '"]').show();
        })
        .on('success.form.bv', function(e) {
          e.preventDefault();
          lyrQuery.removeAllFeatures();
          var f = new OpenLayers.Feature.Vector(
            new OpenLayers.Geometry.Point($('#customLon').val(),$('#customLat').val()).transform(proj4326,proj3857)
          );
          lyrQuery.addFeatures([f]);
          $('#location').selectpicker('val','custom');
          $('#coords').modal('hide');
          query();
        })
        .modal('show');
    }
    else {
      lyrQuery.removeAllFeatures();
      var f = _.find(lyrCatalog.features,function(o){return o.attributes.name == val});
      if (f) {
        lyrQuery.addFeatures([f.clone()]);
        map.setCenter([f.geometry.x,f.geometry.y],5);
        query();
      }
    }
  });

  $('.selectpicker').selectpicker({width : 200});

  resize();

  var style = new OpenLayers.Style(
    OpenLayers.Util.applyDefaults({
       pointRadius       : 8
      ,strokeColor       : '#000000'
      ,strokeOpacity     : 0.8
      ,fillColor         : '#ff0000'
      ,fillOpacity       : 0.8
    })
  );
  lyrQuery = new OpenLayers.Layer.Vector(
     'Query points'
    ,{styleMap : new OpenLayers.StyleMap({
       'default' : style
      ,'select'  : style
    })}
  );

  map = new OpenLayers.Map('map',{
    layers  : [
      new OpenLayers.Layer.XYZ(
         'ESRI Ocean'
        ,'http://services.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/${z}/${y}/${x}.jpg'
        ,{
           sphericalMercator : true
          ,isBaseLayer       : true
          ,wrapDateLine      : true
        }
      )
      ,lyrQuery
    ]
    ,center : new OpenLayers.LonLat(-83,28).transform(proj4326,proj3857)
    ,zoom   : 4
  });

  map.events.register('click',this,function(e) {
    lyrQuery.removeAllFeatures();
    var lonLat = map.getLonLatFromPixel(e.xy);
    var f = new OpenLayers.Feature.Vector(
      new OpenLayers.Geometry.Point(lonLat.lon,lonLat.lat)
    );
    lyrQuery.addFeatures([f]);
    $('#location').selectpicker('val','custom');
    query();
  });

  var f = _.find(lyrCatalog.features,function(o) {
    return o.attributes.name == defaults.site;
  });
  lyrQuery.addFeatures([f.clone()]);
  map.setCenter([f.geometry.x,f.geometry.y],5);

  query();
}

function plot() {
  _.each(_.pluck(plotData,'id'),function(o) {
    $('#' + o).remove();
  });
  if (plotData.length == 4) {
    var obsData = _.findWhere(plotData,{id : 'obs'});
    if (obsData) {
      obsData.lines = {show : true,lineWidth : 3}; 
    }

    var minData = _.findWhere(plotData,{id : 'min'});
    if (minData) {
      minData.fillBetween = 'max';
      minData.lines = {show : true,lineWidth : 1,fill : true,fillColor : 'rgba(237,194,64,0.20)'};
    }

    var maxData = _.findWhere(plotData,{id : 'max'});
    if (maxData) {
      maxData.lines  = {show : true,lineWidth : 1};
    }

    var stackOrder = _.invert(['max','min','avg','obs']);
    plotData = _.sortBy(plotData,function(o){return stackOrder[o.id]});
  }

  if (plotData.length == 0 || plotData.length == 4) {
    $.plot(
       $('#time-series-graph')
      ,plotData
      ,{
         xaxis     : {mode  : "time"}
        ,crosshair : {mode  : 'x'   }
        ,grid      : {
           backgroundColor : {colors : ['#fff','#C3DFE5']}
          ,borderWidth     : 1
          ,borderColor     : '#A6D1DB'
          ,hoverable       : true
        }
        ,zoom      : {interactive : true}
        ,pan       : {interactive : true}
        ,legend    : {
           backgroundOpacity : 0.3
          ,labelFormatter: function(label,series) {
            return /min|max/.test(series.id) ? null : label;
          }
        }
        // repeat 1st color to get outer edges of filled area the same color
        ,colors : ['rgba(237,194,64,0.50)','rgba(237,194,64,0.50)',"#afd8f8","#cb4b4b","#4da74d","#9440ed"]
      }
    ); 
    hideSpinner();
  }
}

function showSpinner() {
  // from http://fgnass.github.io/spin.js/
  var opts = {
    lines: 17, // The number of lines to draw
    length: 35, // The length of each line
    width: 10, // The line thickness
    radius: 54, // The radius of the inner circle
    corners: 1, // Corner roundness (0..1)
    rotate: 0, // The rotation offset
    direction: 1, // 1: clockwise, -1: counterclockwise
    color: '#000', // #rgb or #rrggbb or array of colors
    speed: 1, // Rounds per second
    trail: 60, // Afterglow percentage
    shadow: false, // Whether to render a shadow
    hwaccel: false, // Whether to use hardware acceleration
    className: 'spinner', // The CSS class to assign to the spinner
    zIndex: 2e9, // The z-index (defaults to 2000000000)
    top: '50%', // Top position relative to parent
    left: '50%' // Left position relative to parent
  };
  spinner = new Spinner(opts).spin(document.getElementById('spinner'));
}

function hideSpinner() {
  if (spinner) {
    spinner.stop();
    spinner = null;
  }
}

function query() {
  if (spinner) {
    return;
  }
  showSpinner();

  // Find the 1st hit in the catalog that is closest to the query point.
  var queryPt = lyrQuery.features[0].geometry;
  var siteQuery = _.find(lyrCatalog.features,function(f) {
    return f.geometry.distanceTo(queryPt) == 0;
  });
  var reqs = [];
  var title = '';
  if (siteQuery) {
    var geom = siteQuery.geometry.clone().transform(proj3857,proj4326);
    reqs = [
      {
        getObs : catalog['sites'][siteQuery.attributes.group][siteQuery.attributes.name].getObs(
           $('#vars .active').text()
          ,catalog.years[0]
          ,catalog.years[catalog.years.length - 1]
        ) 
        ,title : $('#vars .active').text() + ' from ' + siteQuery.attributes.name
        ,id : 'obs'
        ,postProcess : true
        ,year : $('#years .active').text()
      }
    ];
  }
  else {
    var geom = queryPt.clone().transform(proj3857,proj4326);
    reqs = [
      {
        getObs : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,$('#years .active').text()
          ,geom.x
          ,geom.y
        )
        ,title : $('#years .active').text() + ' ' + $('#vars .active').text() + ' from SABGOM'
        ,id    : 'obs'
      }
      ,{
        getObs : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,false
          ,geom.x
          ,geom.y
          ,'min'
        )
        ,title : 'Minimum ' + $('#vars .active').text() + ' from SABGOM'
        ,year  : $('#years .active').text()
        ,id    : 'min'
      }
      ,{
        getObs : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,false
          ,geom.x
          ,geom.y
          ,'max'
        )
        ,title : 'Maximum ' + $('#vars .active').text() + ' from SABGOM'
        ,year  : $('#years .active').text()
        ,id    : 'max'
      }
      ,{
        getObs : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,false
          ,geom.x
          ,geom.y
          ,'avg'
        )
        ,title : 'Average ' + $('#vars .active').text() + ' from SABGOM'
        ,year  : $('#years .active').text()
        ,id    : 'avg'
      }
    ];
  }

  plotData = [];
  $('#messages').empty();

  var msg = [];
  for (var i = 0; i < reqs.length; i++) {
    msg.push("<span id='" + reqs[i].id + "'>" + reqs[i].title + '<img src="img/progressDots.gif"><br></span>');
  }
  $('#messages').html(msg.join(''));

  $.when(
    (function() {
      var a = [];
      for (var i = 0; i < reqs.length; i++) {
        a.push($.ajax({
           url         : reqs[i].getObs.u
          ,v           : reqs[i].getObs.v
          ,dataType    : 'xml'
          ,title       : reqs[i].title
          ,year        : reqs[i].year
          ,id          : reqs[i].id
          ,postProcess : reqs[i].postProcess
          ,success     : function(r) {
            var data = processData($(r),this.url,this.title,this.year,this.v);
            data[0].id = this.id;
            if (this.postProcess) {
              data = postProcessData(data[0]);
            }
            plotData = plotData.concat(data);
            plot();
          }
        }));
      }
      return a;
    })()
  ).done(function() {
  });
}

function postProcessData(d) {
  // filter out any Feb 29s
  d.data = _.filter(d.data,function(o) {
    return o[0].format('UTC:mmdd') != '0229';
  });
  d.label = '&nbsp;<a target=_blank href=\'' + d.url + '\'>' + d.year + ' ' + d.title + ' (' + d.uom + ')' + '</a>';

  for (var i = 0; i < d.data.length; i++) {
    d.data[i][1] = Number(d.data[i][1]);
  }

  // get everything in terms of a daily average
  var vals = _.groupBy(d.data,function(o) {
    return o[0].format('UTC:yyyy-mm-dd');
  });
  var dailyAverages = [];
  for (o in vals) {
    // you could do some QA/QC here to count # of obs
    dailyAverages.push([
       new Date(Date.UTC(vals[o][0][0].getUTCFullYear(),vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,math.mean(_.map(vals[o],function(o){return o[1]}))
    ]);
  }

  // the in-situ data for the target year only
  var d0 = new Date(Date.UTC(d.year,0,1,0,0));
  var d1 = new Date(Date.UTC(d.year,11,31,23,59));
  d.data = _.filter(dailyAverages,function(o) {
    return d0 <= o[0] && o[0] <= d1;
  });

  // start pulling out stats which means grouping data by mm/dd
  vals = _.groupBy(dailyAverages,function(o) {
    return d.year + '-' + o[0].format('UTC:mm-dd');
  });

  var dAvg = {
     id    : 'avg'
    ,label : '&nbsp;<a target=_blank href=\'' + d.url + '\'>Average ' + d.title + ' (' + d.uom + ')' + '</a>'
    ,data  : []
  };
  for (o in vals) {
    // you could do some QA/QC here to count # of obs
    dAvg.data.push([
       new Date(Date.UTC(d.year,vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,math.mean(_.map(vals[o],function(o){return o[1]}))
    ]);
  }
  dAvg.data = _.sortBy(dAvg.data,function(o){return o[0].getTime()});

  var dMin = {
     id    : 'min'
    ,label : 'Minimum'
    ,data  : []
  };
  for (o in vals) {
    // you could do some QA/QC here to count # of obs
    dMin.data.push([
       new Date(Date.UTC(d.year,vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,math.min(_.map(vals[o],function(o){return o[1]}))
    ]);
  }
  dMin.data = _.sortBy(dMin.data,function(o){return o[0].getTime()});

  var dMax = {
     id    : 'max'
    ,label : 'Maximum'
    ,data  : []
  };
  for (o in vals) {
    // you could do some QA/QC here to count # of obs
    dMax.data.push([
       new Date(Date.UTC(d.year,vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,math.max(_.map(vals[o],function(o){return o[1]}))
    ]);
  }
  dMax.data = _.sortBy(dMax.data,function(o){return o[0].getTime()});

  return [d,dAvg,dMin,dMax];
}

function processData($xml,url,title,year,v) {
  var d = {
     url   : url
    ,title : title
    ,year  : year
    ,data  : []
  };
  var ncss = $xml.find('point');
  if (ncss.length > 0) { // NetcdfSubset response
    ncss.each(function() {
      var point = $(this);
      d.uom = point.find('[name=temp]').attr('units');
      var t = point.find('[name=date]').text();
      // undo fake dates for stats
      if (!_.isUndefined(year)) {
        t = year + t.substr(4);
      }
      d.data.push([
         isoDateToDate(t)
        ,point.find('[name=' + v + ']').text()
      ]);
      d.label = '&nbsp;<a target=_blank href=\'' + url + '\'>' + title + ' (' + d.uom + ')' + '</a>';
    });
  }
  else { // ncSOS response
    d.uom   = $xml.find('uom[code]').attr('code');
    var nil = ["-999.9","-999.0"]; // [$xml.find('nilValue').text()];
    d.label = '&nbsp;<a target=_blank href=\'' + url + '\'>' + title + ' (' + d.uom + ')' + '</a>';
    _.each($xml.find('values').text().split(" "),function(o) {
      var a = o.split(',');
      if ((a.length == 2) && $.isNumeric(a[1]) && nil.indexOf(a[1]) < 0) {
        d.data.push([isoDateToDate(a[0]),a[1]]);
      }
    });
  }
  return [d];
}

function showToolTip(x,y,contents) {
  $('<div id="tooltip">' + contents + '</div>').css({
     position           : 'absolute'
    ,display            : 'none'
    ,top                : y + 10
    ,left               : x + 10
    ,border             : '1px solid #99BBE8'
    ,padding            : '2px'
    ,'background-color' : '#fff'
    ,opacity            : 0.80
    ,'z-index'          : 10000001
  }).appendTo("body").fadeIn(200);
}

function isoDateToDate(s) {
  // 2010-01-01T00:00:00 or 2010-01-01 00:00:00
  s = s.replace("\n",'');
  var p = s.split(/T| /);
  if (p.length == 2) {
    var ymd = p[0].split('-');
    var hm = p[1].split(':');
    return new Date(Date.UTC(
       ymd[0]
      ,ymd[1] - 1
      ,ymd[2]
      ,hm[0]
      ,hm[1]
    ));
  }
  else {
    return false;
  }
}

Date.prototype.getDOY = function() {
  var onejan = new Date(this.getFullYear(),0,1);
  return Math.ceil((this - onejan) / 86400000);
}

function resize() {
  var offset = 51;
  $('#map').height($('#time-series-graph').height() - $('#vars').height() - $('#years').height() - $($('.bootstrap-select')[0]).height() - offset);
  map && map.updateSize();
  plot();
}

window.onresize = resize;
