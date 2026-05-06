<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.1" name="wallsets" tilewidth="32" tileheight="32" tilecount="56" columns="8">
 <image source="../../wall/wallsets.png" width="256" height="240"/>
 <tile id="1">
  <properties>
   <property name="solid" type="bool" value="true"/>
  </properties>
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="0" width="32" height="32"/>
  </objectgroup>
 </tile>
 <tile id="4">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="0" width="32" height="32"/>
   <object id="3" x="0" y="0" width="32" height="32">
    <properties>
     <property name="solid" type="bool" value="true"/>
    </properties>
   </object>
  </objectgroup>
 </tile>
 <tile id="7">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="20" width="32" height="12"/>
   <object id="2" x="1" y="13"/>
  </objectgroup>
 </tile>
 <tile id="22">
  <objectgroup draworder="index" id="2">
   <object id="1" x="19" y="50"/>
  </objectgroup>
 </tile>
</tileset>
