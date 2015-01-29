var prevPoint;
var plotData = [];
var lyrQuery;
var lyrCatalog = new OpenLayers.Layer.Vector();
var map;
var spinner;
var proj3857 = new OpenLayers.Projection("EPSG:3857");
var proj4326 = new OpenLayers.Projection("EPSG:4326");
var dataTable;

function init() {
  $('#buoyTT').html(verbiage.buoyTT.a);
  $('#buoyTT').tooltip().attr('data-original-title',verbiage.buoyTT.info).tooltip('fixTitle');
  $('#modelTT').html(verbiage.modelTT.a);
  $('#modelTT').tooltip().attr('data-original-title',verbiage.modelTT.info).tooltip('fixTitle');

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
        var format = item.series.avgInterval == 'Day' ? 'UTC:mmm dd, yyyy' : 'UTC:mmm yyyy';
        var d = x.format(format);
        // display date from stat calcs if avaialble
        if (item.series.data[item.dataIndex][2]) {
          d = item.series.data[item.dataIndex][2].format(format);
        }
        // generalize further if this is the avg line
        if (item.series.id == 'avg') {
          d = x.format(item.series.avgInterval == 'Day' ? 'UTC:mmm dd' : 'UTC:mmm');
        }
        showToolTip(
           item.pageX
          ,item.pageY
          ,d + ' : ' + (Math.round(y * 100) / 100) + ' ' + item.series.uom);
      }
      prevPoint = item.dataIndex;
    }
    else {
      $('#tooltip').remove();
      prevPoint = null;
    }
  });

  _.each(_.pluck(catalog.variables,'name').sort(),function(o) {
    $('#vars .panel-body').append('<button type="button" data-value="' + o + '" class="btn btn-default">' + o + '</button> ');
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
    var selected = defaults.year == o ? 'selected="selected"' : '';
    $('#years select').append('<option value="' + o + '" ' + selected + '>' + o + '</option> ');
  });
  $('#years').change(function() {
    query();
  });

  _.each(['Day','Month'],function(o) {
    $('#averages .panel-body').append('<button type="button" data-value="' + o + '" class="btn btn-default">' + o + '</button> ');
  });
  $('#averages [data-value="' + defaults.avg + '"]').removeClass('btn-default').addClass('btn-custom-lighten active');
  $('#averages button').click(function() {
    $(this).blur();
    var selVal = $(this).data('value');
    $('#averages button').each(function() {
      if ($(this).data('value') == selVal) {
        $(this).removeClass('btn-default').addClass('btn-custom-lighten').addClass('active');
      }
      else {
        $(this).removeClass('btn-custom-lighten').removeClass('active').addClass('btn-default');
      }
    });
    query();
  });

  _.each(['Buoy','Model'],function(o) {
    $('#sources .panel-body').append('<button type="button" data-value="' + o + '" class="btn btn-default">' + o + '</button> ');
  });
  $('#sources [data-value="' + defaults.src + '"]').removeClass('btn-default').addClass('btn-custom-lighten active');
  $('#sources button').click(function() {
    $(this).blur();
    var selVal = $(this).data('value');
    $('#map').fadeTo(500,selVal == 'Model' ? 1 : 0.5);
    $('#sources button').each(function() {
      if ($(this).data('value') == selVal) {
        $(this).removeClass('btn-default').addClass('btn-custom-lighten').addClass('active');
      }
      else {
        $(this).removeClass('btn-custom-lighten').removeClass('active').addClass('btn-default');
      }
    });
    $('#location optgroup[label="Custom (model only)"]').prop('disabled',selVal == 'Buoy');
    // We will need to select a default buoy if the current location isn't a buoy (null).
    if (selVal == 'Buoy' && _.isNull($('#location').selectpicker('val'))) {
      $('#location').selectpicker('val',$('#location option[value!="custom"][value!="manual"]').first().val());
      $('#location').selectpicker('refresh');
      $('#location').trigger('change');
    }
    else {
      $('#location').selectpicker('refresh');
      query();
    }
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

  if (defaults.src == 'Buoy') {
    $('#location optgroup[label="Custom (model only)"]').prop('disabled',true);
    $('#location').selectpicker('refresh');
    $('#map').fadeTo(0,0.5);
  }

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
          if (lyrQuery.features.length == 1) {
            var g = lyrQuery.features[0].geometry.clone().transform(proj3857,proj4326);
            $('#customLon').val(Math.round(g.x * 10000) / -10000);
            $('#customLat').val(Math.round(g.y * 10000) / 10000);
          }
        })
        .on('error.validator.bv', function(e, data) {
          data.element
          // Hide all the messages
          .find('.help-block[data-bv-for="' + data.field + '"]').hide()
          // Show only message associated with current validator
          .filter('[data-bv-validator="' + data.validator + '"]').show();
        })
        .on('success.form.bv', function(e) {
          e.preventDefault();
          lyrQuery.removeAllFeatures();
          var f = new OpenLayers.Feature.Vector(
            new OpenLayers.Geometry.Point($('#customLon').val() * -1,$('#customLat').val()).transform(proj4326,proj3857)
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

  resizeAll();

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
    if ($('#sources .active').first().data('value') != 'Model') {
      return;
    }
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

  var obsData = _.findWhere(plotData,{id : 'obs'});
  if (plotData.length == 4 && !_.findWhere(plotData,{breaksInserted : true})) {
    obsData.lines = {show : true,lineWidth : 3}; 
    obsData.data = insertBreaks(obsData.data,obsData.avgInterval);
    obsData.breaksInserted = true;

    var minData = _.findWhere(plotData,{id : 'min'});
    minData.fillBetween = 'max';
    minData.lines = {show : true,lineWidth : 0,fill : true,fillColor : '#ffff99'};
    minData.data = insertBreaks(minData.data,obsData.avgInterval);
    minData.breaksInserted = true;

    var maxData = _.findWhere(plotData,{id : 'max'});
    maxData.lines = {show : true,lineWidth : 0};
    maxData.data = insertBreaks(maxData.data,obsData.avgInterval);
    maxData.breaksInserted = true;

    var avgData = _.findWhere(plotData,{id : 'avg'});
    avgData.data = insertBreaks(avgData.data,obsData.avgInterval);
    avgData.breaksInserted = true;

    var stackOrder = _.invert(['max','min','avg','obs']);
    plotData = _.sortBy(plotData,function(o){return stackOrder[o.id]});
  }

  if (plotData.length == 0 || plotData.length == 4) {
    $.plot(
       $('#time-series-graph')
      ,plotData
      ,{
         axisLabels : {show : true}
        ,xaxis     : {mode  : "time"}
        ,yaxes     : [{position : 'left',axisLabel : obsData ? obsData.uom : ''}]
        ,crosshair : {mode  : 'x'   }
        ,grid      : {
           backgroundColor : '#C3DFE5'
          ,borderWidth     : 1
          ,borderColor     : '#A6D1DB'
          ,hoverable       : true
        } 
        ,zoom      : {interactive : true}
        ,pan       : {interactive : true}
        ,legend    : {
           container         : $('#legend')
          ,labelFormatter    : function(label,series) {
            if (series.id == 'min') {
              return label.replace(/Minimum/,'Min-Max');
            }
            else if (series.id == 'max') {
              return null;
            }
            else {
              return label;
            }
          }
        }
        // repeat 1st color to get outer edges of filled area the same color
        ,colors : ['#ffff00','#ffff00',"#00c900","#cb4b4b"]
      }
    ); 
    hideSpinner();
    resizeMap();
  }

  if (plotData.length == 4) {
    $('#summary').html('The data in the above graph was taken from <b>' + obsData.descr.name + '</b>.  It has a reporting frequency of ' + obsData.descr.freq + '.');
    initDataTable([],[{title : 'a'},{title : 'b'},{title : 'c'},{title : 'd'},{title : 'e'}]);
    $('#dataTable_wrapper').show();
    // flip the legend order
    $($('#legend tr').get().reverse()).each(function(){$(this).appendTo($(this).parent())});
  }
}

function prepareDownload() {
  // Get a list of all dates (dates may vary by line).
  var dates = [];
  var format;
  for (var i = 0; i < plotData.length; i++) {
    dates = dates.concat(_.map(plotData[i].data,function(o){return o ? o[0].getTime() : false}));
  };
  dates = _.filter(_.uniq(dates),function(o){return o}).sort();

  // March through the dates and pull out data.
  var data = {};
  for (var i = 0; i < plotData.length; i++) {
    format = plotData[i].avgInterval == 'Day' ? 'UTC:yyyy-mm-dd' : 'UTC:yyyy-mm';
    for (var j = 0; j < plotData[i].data.length; j++) {
      if (plotData[i].data[j]) {
        var d = plotData[i].data[j][0].getTime();
        if (!data[d]) {
          data[d] = [];
        }
        data[d][i] = Math.round(plotData[i].data[j][1] * 100) / 100;
      }
    }
  }

  var cols = ['Date'];
  // reverse the cols in the headers
  for (i = plotData.length - 1; i >= 0; i--) {
    cols.push(plotData[i].title ? plotData[i].title  + ' ' + plotData[i].uom : plotData[i].id);
  }

  var rows = [];
  _.each(data,function(v,k) {
    for (var i = 0; i < plotData.length; i++) {
      if (_.isUndefined(v[i])) {
        v[i] = null;
      }
    }
    // reverse the cols in the data
    rows.push([new Date(Number(k)).format(format)].concat(v.reverse()));
  });

  dataTable.fnClearTable();
  dataTable.fnAddData(rows);
  return cols;
}

function initDataTable(data,columns) {
  dataTable = $('#dataTable').dataTable({
     dom        : 'T<"clear">lfrtip'
    ,tableTools : {
       sSwfPath : './lib/jquery/DataTables-1.10.2/extensions/TableTools/swf/copy_csv_xls_pdf.swf'
      ,aButtons : [{
         sExtends    : 'csv'
        ,sButtonText : 'Download Data'
        ,fnClick     : function ( nButton, oConfig, oFlash ) {
          var cols = prepareDownload();
          // swap out the column headers for the real thing
          for (var i = 0; i < cols.length; i++) {
            cols[i] = '"' + cols[i].replace(/"/g,'_') + '"';
          }
          var br = navigator.userAgent.match(/Windows/) ? "\r\n" : "\n";
          var d  = this.fnGetTableData(oConfig).split(br);
          d.shift();
          d.unshift(cols.join(','));
          this.fnSetText(oFlash,d.join(br));
        }
      }]
    }
    ,data        : data
    ,columns     : columns
    ,searching   : false
    ,info        : false
    ,paging      : false
    ,bDestroy    : true
    ,deferRender : true
  });
  $('#ToolTables_dataTable_0').removeClass('btn-default').addClass('btn-custom-lighten active');
}

function showSpinner() {
  // from http://fgnass.github.io/spin.js/
  var opts = {
    lines: 18, // The number of lines to draw
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
  if (spinner || lyrQuery.features.length == 0) {
    return;
  }
  showSpinner();

  // Find the 1st hit in the catalog that is closest to the query point.
  var queryPt = lyrQuery.features[0].geometry;
  var siteQuery = $('#sources .active').first().data('value') == 'Buoy' && _.find(lyrCatalog.features,function(f) {
    return f.geometry.distanceTo(queryPt) == 0;
  });
  var reqs = [];
  var title = '';
  if (siteQuery) {
    var geom = siteQuery.geometry.clone().transform(proj3857,proj4326);
    reqs = [
      {
        getObs       : catalog['sites'][siteQuery.attributes.group][siteQuery.attributes.name].getObs(
           $('#vars .active').text()
          ,catalog.years[0]
          ,catalog.years[catalog.years.length - 1]
        ) 
        ,title       : $('#vars .active').text() + ' from ' + siteQuery.attributes.name
        ,id          : 'obs'
        ,postProcess : true
        ,year        : $('#year').selectpicker('val')
        ,avgInterval : $('#averages .active').text()
        ,descr       : catalog['sites'][siteQuery.attributes.group][siteQuery.attributes.name].descr
        ,uom         : _.findWhere(catalog['variables'],{name : $('#vars .active').text()}).uom
      }
    ];
  }
  else {
    var geom = queryPt.clone().transform(proj3857,proj4326);
    reqs = [
      {
        getObs       : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,$('#year').selectpicker('val')
          ,$('#averages .active').text()
          ,geom.x
          ,geom.y
        )
        ,title       : $('#year').selectpicker('val') + ' ' + $('#vars .active').text() + ' from SABGOM'
        ,id          : 'obs'
        ,avgInterval : $('#averages .active').text()
        ,descr       : catalog['models']['SABGOM'].descr
        ,uom         : _.findWhere(catalog['variables'],{name : $('#vars .active').text()}).uom
      }
      ,{
        getObs       : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,false
          ,$('#averages .active').text()
          ,geom.x
          ,geom.y
          ,'min'
        )
        ,title       : catalog.years[0] + '-' + catalog.years[catalog.years.length - 1] + ' Minimum ' + $('#vars .active').text() + ' from SABGOM'
        ,year        : $('#year').selectpicker('val')
        ,id          : 'min'
        ,avgInterval : $('#averages .active').text()
        ,uom         : _.findWhere(catalog['variables'],{name : $('#vars .active').text()}).uom
      }
      ,{
        getObs       : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,false
          ,$('#averages .active').text()
          ,geom.x
          ,geom.y
          ,'max'
        )
        ,title       : catalog.years[0] + '-' + catalog.years[catalog.years.length - 1] + ' Maximum ' + $('#vars .active').text() + ' from SABGOM'
        ,year        : $('#year').selectpicker('val')
        ,id          : 'max'
        ,avgInterval : $('#averages .active').text()
        ,uom         : _.findWhere(catalog['variables'],{name : $('#vars .active').text()}).uom
      }
      ,{
        getObs       : catalog['models']['SABGOM'].getObs(
           $('#vars .active').text()
          ,false
          ,$('#averages .active').text()
          ,geom.x
          ,geom.y
          ,'avg'
        )
        ,title       : catalog.years[0] + '-' + catalog.years[catalog.years.length - 1] + ' Average ' + $('#vars .active').text() + ' from SABGOM'
        ,year        : $('#year').selectpicker('val')
        ,id          : 'avg'
        ,avgInterval : $('#averages .active').text()
        ,uom         : _.findWhere(catalog['variables'],{name : $('#vars .active').text()}).uom
      }
    ];
  }

  plotData = [];
  $('#legend').empty();
  $('#summary').empty();
  $('#dataTable_wrapper').hide();

  var msg = [];
  for (var i = 0; i < reqs.length; i++) {
    msg.push("<span class='smallFont' id='" + reqs[i].id + "'>Loading " + reqs[i].title + '<img src="img/progressDots.gif"><br></span>');
    if (console && console.log) {
      console.log({title : reqs[i].title,url : reqs[i].getObs.u});
    }
  }
  $('#legend').html(msg.join(''));

  setTimeout(function() {
    for (var i = 0; i < reqs.length; i++) {
      $.ajax({
         url         : reqs[i].getObs.u
        ,v           : reqs[i].getObs.v
        ,y           : reqs[i].getObs.y
        ,dataType    : 'xml'
        ,title       : reqs[i].title
        ,year        : reqs[i].year
        ,id          : reqs[i].id
        ,postProcess : reqs[i].postProcess
        ,avgInterval : reqs[i].avgInterval
        ,descr       : reqs[i].descr
        ,uom         : reqs[i].uom
        ,success     : function(r) {
          var data = processData($(r),this.title,this.year,this.v,this.uom);
          data[0].id          = this.id;
          data[0].avgInterval = this.avgInterval;
          data[0].descr       = this.descr;
          data[0].v           = this.v;
          data[0].y           = this.y;
          if (this.postProcess) {
            data = postProcessData(data[0]);
          }
          plotData = plotData.concat(data);
          plot();
        }
      });
    }
  },100);
}

function postProcessData(d) {
  // filter out any Feb 29s
  d.data = _.filter(d.data,function(o) {
    return o[0].format('UTC:mmdd') != '0229';
  });
  d.label = '&nbsp;' + d.year + ' ' + d.title;

  for (var i = 0; i < d.data.length; i++) {
    d.data[i][1] = Number(d.data[i][1]);
  }

  // get everything in terms of the avgInterval average
  var format = d.avgInterval == 'Day' ? 'UTC:yyyy-mm-dd' : 'UTC:yyyy-mm';
  var vals = _.groupBy(d.data,function(o) {
    return o[0].format(format);
  });
  var sVals = {};
  for (o in vals) {
    sVals[o] = stats(vals[o]);
  }

  var averages = [];
  for (o in vals) {
    averages.push([
       new Date(Date.UTC(vals[o][0][0].getUTCFullYear(),vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,sVals[o].avg
    ]);
  }

  // the in-situ data for the target year only
  var d0 = new Date(Date.UTC(d.year,0,1,0,0));
  var d1 = new Date(Date.UTC(d.year,11,31,23,59));
  d.data = _.filter(averages,function(o) {
    return d0 <= o[0] && o[0] <= d1;
  });

  // start pulling out stats which means grouping data by mm/dd
  vals = _.groupBy(averages,function(o) {
    return d.year + '-' + o[0].format(d.avgInterval == 'Day' ? 'UTC:mm-dd' : 'UTC:mm');
  });
  sVals = {};
  for (o in vals) {
    sVals[o] = stats(vals[o]);
  }

  var dAvg = {
     id    : 'avg'
    ,uom   : d.uom
    ,label : '&nbsp;' + d.y[0] + '-' + d.y[1] + ' Average ' + d.title
    ,data  : []
    ,avgInterval : d.avgInterval
  };
  for (o in vals) {
    dAvg.data.push([
       new Date(Date.UTC(d.year,vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,sVals[o].avg
    ]);
  }
  dAvg.data = _.sortBy(dAvg.data,function(o){return o[0].getTime()});

  var dMin = {
     id    : 'min'
    ,uom   : d.uom
    ,label : '&nbsp;' + d.y[0] + '-' + d.y[1] + ' Minimum ' + d.title
    ,data  : []
    ,avgInterval : d.avgInterval
  };
  for (o in vals) {
    // you could do some QA/QC here to count # of obs
    dMin.data.push([
       new Date(Date.UTC(d.year,vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,sVals[o].min[1]
      ,sVals[o].min[0]
    ]);
  }
  dMin.data = _.sortBy(dMin.data,function(o){return o[0].getTime()});

  var dMax = {
     id    : 'max'
    ,uom   : d.uom
    ,label : '&nbsp;' + d.y[0] + '-' + d.y[1] + ' Maximum ' + d.title
    ,data  : []
    ,avgInterval : d.avgInterval
  };
  for (o in vals) {
    dMax.data.push([
       new Date(Date.UTC(d.year,vals[o][0][0].getUTCMonth(),vals[o][0][0].getUTCDate()))
      ,sVals[o].max[1]
      ,sVals[o].max[0]
    ]);
  }
  dMax.data = _.sortBy(dMax.data,function(o){return o[0].getTime()});

  return [d,dAvg,dMin,dMax];
}

function processData($xml,title,year,v,uom) {
  var d = {
     title : title
    ,year  : year
    ,data  : []
  };
  var ncss = $xml.find('point');
  if (ncss.length > 0) { // NetcdfSubset response
    ncss.each(function() {
      var point = $(this);
      var u     = point.find('[name=' + v + ']').attr('units');
      d.uom = uom(u).label;
      var t = point.find('[name=date]').text();
      // undo fake dates for stats
      if (!_.isUndefined(year)) {
        t = year + t.substr(4);
      }
      d.data.push([
         isoDateToDate(t)
        ,uom(u,point.find('[name=' + v + ']').text()).value
      ]);
      d.label = '&nbsp;' + title;
    });
  }
  else { // ncSOS response
    var u   = $xml.find('uom[code],swe\\:uom[code]').attr('code');
    d.uom   = uom(u).label;
    var nil = [$xml.find('nilValue,swe\\:nilValue').text()];
    d.label = '&nbsp;' + title + ' (' + d.uom + ')';
    _.each($xml.find('values,swe\\:values').text().split(" "),function(o) {
      var a = o.split(',');
      if ((a.length == 2) && $.isNumeric(a[1]) && nil.indexOf(a[1]) < 0) {
        d.data.push([isoDateToDate(a[0]),uom(u,a[1]).value]);
      }
    });
  }

  // do any necessary unit conversions

  return [d];
}

function stats(data) {
  var c = 0;
  var t = 0;
  var min;
  var max;
  _.each(data,function(o) {
    if ($.isNumeric(o[1])) {
      t += o[1];
      if (_.isUndefined(min) || o[1] < min[1]) {
        min = o;
      }
      if (_.isUndefined(max) || o[1] > max[1]) {
        max = o;
      }
      c++; 
    }
  });
  return {
     avg : c > 1 ? t / c : null
    ,min : !_.isUndefined(min) && c > 1 ? min : [null,null]
    ,max : !_.isUndefined(max) && c > 1 ? max : [null,null]
  };
}

function insertBreaks(data,avgInterval) {
  var h = {
     'Day'   : function(d) {return d.getDOY()}
    ,'Month' : function(d) {return d.getUTCMonth()}
  };
  // Insert a null between any non-consecutive avgInterval's to keep points from being
  // connected in the graph.
  var d = []; 
  if (data.length > 0) {
    d.push(data[0]);
  }
  for (var i = 1; i < data.length; i++) {
    if (h[avgInterval](data[i - 1][0]) != h[avgInterval](data[i][0]) - 1) {
      d.push(null);
    }
    d.push(data[i]);
  }
  return d;
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
  var onejan = new Date(Date.UTC(this.getFullYear(),0,1));
  return Math.ceil((this - onejan) / 86400000);
}

function resizeMap() {
  $('#map').height($(window).height() - $('#title').height() - $('#locations').position().top - $('#map').position().top - 40);
  map && map.updateSize();
}

function resizeAll() {
  var fixedHeightBelowGraph = 120;
  $('#resultsWrapper').height($(window).height() - $('#title').height() - $('#resultsWrapper').position().top - 24);
  $('#time-series-graph').height($('#resultsWrapper').height() - $('#time-series-graph').position().top + $('#resultsWrapper').position().top - fixedHeightBelowGraph);
  resizeMap();
  plot();
}

window.onresize = resizeAll;
