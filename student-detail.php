<?php
require_once "../config.php";

use \Tsugi\Core\LTIX;
use \Tsugi\Core\User;
use \Tsugi\Util\U;

// No parameter means we require CONTEXT, USER, and LINK
$LAUNCH = LTIX::requireData();
$p = $CFG->dbprefix;

// Instructor only
if (!$USER->instructor) {
    http_response_code(403);
    die('Requires instructor role');
}

// Get user_id parameter
if (!isset($_REQUEST['user_id'])) {
    $_SESSION['error'] = 'user_id parameter required';
    header('Location: '.addSession('index.php'));
    return;
}

$target_user_id = $_REQUEST['user_id'] + 0;

// Load user info
$user_row = User::loadUserInfoBypass($target_user_id);
if ($user_row == false) {
    $_SESSION['error'] = 'Could not load student data.';
    header('Location: '.addSession('index.php'));
    return;
}

// Handle clear signature post
if (isset($_POST['clear_signature'])) {
    // Validate CSRF if sesskey is available
    if (isset($_SESSION['sesskey'])) {
        if (!isset($_POST['sesskey']) || $_POST['sesskey'] != $_SESSION['sesskey']) {
            $_SESSION['error'] = 'Invalid session. Please try again.';
            header('Location: '.addSession('student-detail.php?user_id='.$target_user_id));
            return;
        }
    }
    
    // Load the result for this user/link
    $result_row = $PDOX->rowDie(
        "SELECT result_id, json FROM {$p}lti_result 
        WHERE link_id = :LI AND user_id = :UI",
        array(':LI' => $LINK->id, ':UI' => $target_user_id)
    );
    
    if ($result_row) {
        // Clear signature data
        $json_data = $result_row['json'] ? json_decode($result_row['json'], true) : array();
        if (isset($json_data['signature'])) {
            unset($json_data['signature']);
        }
        
        $PDOX->queryDie(
            "UPDATE {$p}lti_result SET json = :JSON WHERE result_id = :RI",
            array(':JSON' => json_encode($json_data), ':RI' => $result_row['result_id'])
        );
        
        $_SESSION['success'] = 'Signature cleared. Student can re-sign to receive a grade.';
    } else {
        $_SESSION['error'] = 'No result found for this student.';
    }
    
    header('Location: '.addSession('student-detail.php?user_id='.$target_user_id));
    return;
}

// Load signature data for this student
$result_row = $PDOX->rowDie(
    "SELECT json FROM {$p}lti_result 
    WHERE link_id = :LI AND user_id = :UI",
    array(':LI' => $LINK->id, ':UI' => $target_user_id)
);

$signature_data = false;
if ($result_row && $result_row['json']) {
    $json_data = json_decode($result_row['json'], true);
    if ($json_data && isset($json_data['signature'])) {
        $signature_data = $json_data['signature'];
    }
}

// Set up menu
$menu = new \Tsugi\UI\MenuSet();
$menu->addLeft('Back to Student List', 'index.php');

// Render view
$OUTPUT->header();
$OUTPUT->bodyStart();
$OUTPUT->topNav($menu);
$OUTPUT->flashMessages();

echo('<h2>Student Detail</h2>');
echo('<p><strong>Student:</strong> '.htmlentities($user_row['displayname'] ?? 'Unknown').'</p>');
if (isset($user_row['email']) && strlen($user_row['email']) > 0) {
    echo('<p><strong>Email:</strong> '.htmlentities($user_row['email']).'</p>');
}

echo('<hr>');

if ($signature_data && isset($signature_data['signed']) && $signature_data['signed']) {
    echo('<h3>Signature Information</h3>');
    echo('<table class="table table-bordered">');
    
    echo('<tr><th>Signed:</th><td>Yes</td></tr>');
    
    if (isset($signature_data['signed_at'])) {
        $dt = new DateTime($signature_data['signed_at']);
        echo('<tr><th>Signed At:</th><td>'.htmlentities($dt->format('F j, Y \a\t g:i A')).'</td></tr>');
    }
    
    if (isset($signature_data['typed_name'])) {
        echo('<tr><th>Typed Name:</th><td>'.htmlentities($signature_data['typed_name']).'</td></tr>');
    }
    
    if (isset($signature_data['tsugi_display_name_at_signing'])) {
        echo('<tr><th>Display Name at Signing:</th><td>'.htmlentities($signature_data['tsugi_display_name_at_signing']).'</td></tr>');
    }
    
    echo('</table>');
    
    echo('<hr>');
    echo('<h3>Agreement Text Snapshot</h3>');
    echo('<div class="well" style="white-space: pre-wrap;">');
    if (isset($signature_data['agreement_text_snapshot'])) {
        echo(htmlentities($signature_data['agreement_text_snapshot']));
    } else {
        echo('(Not available)');
    }
    echo('</div>');
    
    echo('<hr>');
    echo('<h3>Actions</h3>');
    echo('<form method="post" onsubmit="return confirm(\'Are you sure you want to clear this signature? The student will need to re-sign to receive a grade.\');">');
    if (isset($_SESSION['sesskey'])) {
        echo('<input type="hidden" name="sesskey" value="'.htmlentities($_SESSION['sesskey']).'">');
    }
    echo('<button type="submit" name="clear_signature" class="btn btn-warning">Clear Signature</button>');
    echo('</form>');
    
} else {
    echo('<div class="alert alert-info">');
    echo('<p><strong>This student has not signed the agreement yet.</strong></p>');
    echo('</div>');
}

$OUTPUT->footer();

