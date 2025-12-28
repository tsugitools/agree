<?php

$REGISTER_LTI2 = array(
"name" => "Agreement Tool",
"FontAwesome" => "fa-file-signature",
"short_name" => "Agreement",
"description" => "A simple tool for students to sign agreements. Students sign by checking a box and typing their name. Once signed, a grade of 1.0 is sent to the LMS.",
    // By default, accept launch messages..
    "messages" => array("launch"),
    "privacy_level" => "name_only",  // anonymous, name_only, public
    "license" => "Apache",
    "languages" => array(
        "English"
    ),
    "source_url" => "https://github.com/tsugitools/agree",
    // For now Tsugi tools delegate this to /lti/store
    "placements" => array(
        /*
        "course_navigation", "homework_submission",
        "course_home_submission", "editor_button",
        "link_selection", "migration_selection", "resource_selection",
        "tool_configuration", "user_navigation"
        */
    ),
    "screen_shots" => array(
    )

);

