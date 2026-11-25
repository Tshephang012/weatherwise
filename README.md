# weatherwise
WeatherWise is a responsive weather application that allows users to search for a city, view current conditions and access five daily forecasts summaries. Users can personalise their display and view previously saved weather when offline. 
The original brief required Svelte, the application therefore uses four HTML pages, one shared stylesheet and one shared JavaScript file.
Development process
The development began by identifying the required pages: Home, weather details, settings and About. Shared navigation was added to connect the 4 html pages. The next stage involved creating the location-search form and integrating OpenWeather, users select a matching location before its coordinates are used to retrieve current conditions and forecasts data. 
Personalisation features were then added, including temperature units, measurement visibility, themes and a temperature-alert threshold. Browser storage saves preferences and the latest weather results, while a service worker caches the application files for offline access. 
The design was later refined by removing unnecessary homepage cards, adding weather emoji’s, introducing brighter colours and replacing the long forecast list with five daily summaries.
Design Decision
Decision	Rationale
Four linked pages:          Separates searching, detailed weather, settings and application information 
Shared css and JavaScript:	Maintain consistency and reduces duplicated code
                            Weather emoji’s with description:	Adds visual interest without relying on symbols alone
Five daily forecasts cards:	Makes the forecasts shorter and easier to scan 
Responsive layout: 	        Allows content to adapt to mobile and desktop screens
                            Labels and visible 	

Functionality and features
Home	
Users search for a city and select the correct location from matching results, the page displays temperature, weather description, temperature, enabled measurements and updated times. A comment form validates a name, email address and message. It is a demonstration only and does not send or store comments. 
Weather details
This page displays detailed current conditions and five daily forecasts summaries for the selected city. Forecast intervals are grouped by date, cards show a repetitive condition, temperature range and optional measurements. 
Settings 
Users can:
•	Enter or remove their OpenWeather API key 
•	Choose Celsius or Fahrenheit
•	Select light or dark appearance 
•	How or hide humidity wind speed and pressure
•	Enable an in-app high temperature alert 
•	Clear saved weather 
About 
The about page explains how the application works, identifies the data provider and describes privacy, storage and offline limitations.
Challenges
Challenge:	Solution
Cities sharing a name:	                To lets users select from matching locations 
Too many weather forecasts intervals:	  Group intervals into five daily cards
Offline information appearing current: 	Display saved-data notices and timestamps
API key exposure:                      	Avoid hard-coding the key and document on the JS script, instead type it in app with the option to remove the key.


Limitations 
The application has several limitations:
•	Browser based API requests do not keep the key private
•	Temperature alerts work inside applications and not while the application is closed
•	Comments are not delivered to server
•	Offline access required an earlier successful online visit and saved data.


