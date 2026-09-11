<h1 align="center">
  <a href="https://github.com/tufabb/satellite-data-processing">
    <img src="img/logo.png" width="50%" height="50%" alt="Satelac">
  </a>
</h1>

<div align = "center">This repository contains the source code for **SATELAC**, an app that can be used to monitor the water quality of lakes. The project was developed as part of the <a href="https://github.com/Romanian-Space-Initiative"> ROSPIN Summer School</a>.</div> <br><br><br>

## How to run
You can access the app on the following page:



## Functionalities
SATELAC allows the user to check the evolution of the water quality of a lake. Although there are functionalities that focus on Romanian lakes, it can be used to check the state of any lake.<br><br>
Functionalities include being able to:
- Check the status of a manually selected lake around a specified day;
- Check the status of a manually selected lake across the last 30 days before a specified date;
- Check the status of a manually selected lake compared to the last year, same season;
- Visualize the lake's _NDCI_, _NDTI_ and _CDOM_ values and inspect which parts of the water body are more affected;
- Automatically select most lakes in a Romanian County to analyze and evaluate their recent evolution, flagging the appearance of possible problems;

## Indices
SATELAC uses remote sensing to monitor the *Normalized Difference Chlorophyll Index* (**NDCI**), the *Normalized Difference Turbidity Index* (**NDTI**) and the *Colored Dissolved Organic Mater* (**CDOM**) for a time series. These can be treated as indicators for certain events that can impact water quality, like algal blooms or sediment plumes. A more in-depth explanation, as well as sources, can be found in the **<a href="https://docs.google.com/document/d/1oqhylmwxvWNdqpimZDChHtjaqnGKMM7P9XnF26lBTM4/edit?usp=sharing">report</a>**. The lakes are extracted via the *Modified Normalized Difference Water Index* (**MNDWI**), which can be used to detect the water pixels.

## Datasets
The app uses data from **NASA's Harmonized Landsat and Sentinel-2** (HLS) project and **Google Earth Engine** (GEE) to perform the computations necessary to process it. Cloud masking is done using the _Scene Classification_ (SCL) band and GEE's _Cloud Score+_ dataset, which rates the accuracy of pixels. The latter also removes haze.

## Workflow
There are 2 main sections. The first section consists of monitoring the lakes in a Romanian county and flagging possible problems via the evolution of a 'problematic indices' score. The second section consists of manually delimiting a lake with 4 points and inspecting the evolution during a certain time period, which allows the user to see the distribution of the indices' values across the lake. Generally, the app filters through the HLS dataset based on time and location to obtain multispectral imagery, applies cloud masking via SCL first and then _Cloud Score+_, detects the water body and computes the indices and statistics for it.<br><br>
**Section 1**: checks the evolution of all the lakes in a county and computes scores based on the evolution of the number of indices that are over a certain threshold. This gets compared to the scores from last week, the difference between the two determining whether the state of the lake has improved or worsened. The result gets mapped to a color, as can be seen in the Result Interpretation part below; <br><br>
**Section 2**: checks the evolution of a manually delimited lake over a time period: 
- If the user wants to see an analysis over the **last 30-days**, a chart with the evolution of the NDCI, NDTI and CDOM values over the last 30-days before the date selected will be generated;
- If the user wants to see a **seasonal analysis**, the season of the date chosen will be compared with the previous year. Four charts will be generated: one that shows the evolution of the three indices over the season selected, and 3 separate ones for each index, where the data points are either from the same season or from the previous year. A score will be computed from each and be visible along with the charts. The interpretation can be found in the Result Interpretation part below;  
- If the user wants to see an analysis **around the date specified**, dates from the last 7 days before the date selected will be used to generate data points that are plotted on a single graph, similarly to the 30-day analysis.


## Result Interpretation
Evaluating a lake can lead to one of 4 main results, classified by color:
- 🟩 **GREEN**: the state of the lake **has improved**, the number of problematic indices has lowered compared to the previous week;
- 🟨 **YELLOW**: the state of the lake is mostly **unchanged** to that of the last week, the total number of problematic indices didn't increase or decrease;
- 🟥 **RED**: the state of the lake **has worsened**, the number of problematic indices has increased compared to the previous week - this may signify an anomaly, such as an algal bloom or a sediment plume;
- 🔳 **GRAY**: data is missing.
