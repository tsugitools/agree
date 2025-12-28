<?php
require_once "../config.php";

use \Tsugi\Core\LTIX;
use \Tsugi\Core\Settings;
use \Tsugi\UI\SettingsForm;
use \Tsugi\UI\Table;
use \Tsugi\Core\Result;
use \Tsugi\Util\U;

// No parameter means we require CONTEXT, USER, and LINK
$LAUNCH = LTIX::requireData();
$p = $CFG->dbprefix;

// Handle settings post (instructor only)
// Get old text BEFORE handleSettingsPost saves it
$old_text = $LAUNCH->link->settingsGet('agreement_text', '');
$new_text = isset($_POST['agreement_text']) ? trim($_POST['agreement_text']) : '';

if ( SettingsForm::handleSettingsPost() ) {
    // Check if agreement text changed
    // If text changed (any change at all), clear signatures
    if ($old_text !== $new_text) {
        // Check if any students have signed by looking for signature data in JSON
        $results = $PDOX->allRowsDie(
            "SELECT result_id, json FROM {$p}lti_result 
            WHERE link_id = :LI AND json IS NOT NULL AND json != ''",
            array(':LI' => $LINK->id)
        );
        $signed_count = 0;
        foreach ($results as $result) {
            $json_data = json_decode($result['json'], true);
            if ($json_data && isset($json_data['signature']) && 
                isset($json_data['signature']['signed']) && 
                $json_data['signature']['signed']) {
                $signed_count++;
            }
        }
        
        if ($signed_count > 0 && !isset($_POST['confirm_clear'])) {
            // Show warning - need confirmation
            $_SESSION['error'] = 'You must confirm that you understand changing the agreement will clear all signatures.';
            header('Location: '.addSession('index.php'));
            return;
        }
        
        // Clear all signatures for this link
        if ($signed_count > 0) {
            // Get all results with signatures
            $results = $PDOX->allRowsDie(
                "SELECT result_id, json FROM {$p}lti_result 
                WHERE link_id = :LI AND json IS NOT NULL AND json != ''",
                array(':LI' => $LINK->id)
            );
            
            foreach ($results as $result) {
                $json_data = json_decode($result['json'], true);
                if ($json_data && isset($json_data['signature'])) {
                    unset($json_data['signature']);
                    // If json_data is now empty, set to NULL, otherwise encode it
                    if (empty($json_data)) {
                        $PDOX->queryDie(
                            "UPDATE {$p}lti_result SET json = NULL WHERE result_id = :RI",
                            array(':RI' => $result['result_id'])
                        );
                    } else {
                        $PDOX->queryDie(
                            "UPDATE {$p}lti_result SET json = :JSON WHERE result_id = :RI",
                            array(':JSON' => json_encode($json_data), ':RI' => $result['result_id'])
                        );
                    }
                }
            }
            
            $_SESSION['success'] = 'Agreement text updated. All signatures have been cleared.';
        }
    }
    
    header('Location: '.addSession('index.php'));
    return;
}

// Handle student signature post
if (isset($_POST['sign']) && !$USER->instructor) {
    // Validate CSRF if sesskey is available
    if (isset($_SESSION['sesskey'])) {
        if (!isset($_POST['sesskey']) || $_POST['sesskey'] != $_SESSION['sesskey']) {
            $_SESSION['error'] = 'Invalid session. Please try again.';
            header('Location: '.addSession('index.php'));
            return;
        }
    }
    
    // Check if already signed
    $signature_data = $LAUNCH->result->getJsonKey('signature', false);
    if ($signature_data && isset($signature_data['signed']) && $signature_data['signed']) {
        $_SESSION['error'] = 'You have already signed this agreement.';
        header('Location: '.addSession('index.php'));
        return;
    }
    
    // Validate input
    $agree_checked = isset($_POST['agree']) && $_POST['agree'] == '1';
    $typed_name = isset($_POST['typed_name']) ? trim($_POST['typed_name']) : '';
    
    if (!$agree_checked) {
        $_SESSION['error'] = 'You must check the "I agree" checkbox to sign.';
        header('Location: '.addSession('index.php'));
        return;
    }
    
    if (strlen($typed_name) == 0) {
        $_SESSION['error'] = 'You must type your name to sign.';
        header('Location: '.addSession('index.php'));
        return;
    }
    
    // Get agreement text
    $agreement_text = $LAUNCH->link->settingsGet('agreement_text', '');
    if (strlen($agreement_text) == 0) {
        $_SESSION['error'] = 'Agreement text is not configured.';
        header('Location: '.addSession('index.php'));
        return;
    }
    
    // Store signature data
    $signature_data = array(
        'signed' => true,
        'signed_at' => date('c'), // ISO 8601
        'typed_name' => $typed_name,
        'tsugi_display_name_at_signing' => $USER->displayname,
        'agreement_text_snapshot' => $agreement_text,
        'agreement_hash' => md5($agreement_text)
    );
    
    // Get or create result record
    $result_row = $PDOX->rowDie(
        "SELECT result_id, json FROM {$p}lti_result 
        WHERE link_id = :LI AND user_id = :UI",
        array(':LI' => $LINK->id, ':UI' => $USER->id)
    );
    
    $json_data = array('signature' => $signature_data);
    
    if ($result_row) {
        // Update existing result
        $result_id = $result_row['result_id'];
        $existing_json = $result_row['json'] ?: '{}';
        $existing_data = json_decode($existing_json, true);
        if (!$existing_data) $existing_data = array();
        $existing_data['signature'] = $signature_data;
        $json_data = $existing_data;
        
        $PDOX->queryDie(
            "UPDATE {$p}lti_result SET json = :JSON, updated_at = NOW() WHERE result_id = :RI",
            array(':JSON' => json_encode($json_data), ':RI' => $result_id)
        );
    } else {
        // Create result if it doesn't exist
        $PDOX->queryDie(
            "INSERT INTO {$p}lti_result (link_id, user_id, context_id, json, created_at, updated_at)
            VALUES (:LI, :UI, :CI, :JSON, NOW(), NOW())",
            array(
                ':LI' => $LINK->id,
                ':UI' => $USER->id,
                ':CI' => $CONTEXT->id,
                ':JSON' => json_encode($json_data)
            )
        );
        $result_id = $PDOX->lastInsertId();
    }
    
    // Send grade 1.0
    // Ensure we have a result object for grade sending
    if (isset($RESULT) && $RESULT && $RESULT->id) {
        $RESULT->gradeSend(1.0, false);
    } else {
        // Result might not be loaded yet, load it
        $RESULT = Result::loadResult($result_id);
        if ($RESULT) {
            $RESULT->gradeSend(1.0, false);
        }
    }
    
    $_SESSION['success'] = 'Agreement signed successfully.';
    header('Location: '.addSession('index.php'));
    return;
}

// Get agreement text
$agreement_text = $LAUNCH->link->settingsGet('agreement_text', '');

// Get signature data for current user
$signature_data = false;
if ($LAUNCH->result && $LAUNCH->result->id) {
    $result_row = $PDOX->rowDie(
        "SELECT json FROM {$p}lti_result 
        WHERE link_id = :LI AND user_id = :UI",
        array(':LI' => $LINK->id, ':UI' => $USER->id)
    );
    if ($result_row && $result_row['json']) {
        $json_data = json_decode($result_row['json'], true);
        if ($json_data && isset($json_data['signature'])) {
            $signature_data = $json_data['signature'];
        }
    }
}

// Check if any students have signed (for settings warning)
$has_signatures = false;
if ($USER->instructor) {
    // Quick check for any signatures
    $signature_check = $PDOX->allRowsDie(
        "SELECT R.json FROM {$p}lti_result AS R
        WHERE R.link_id = :LI AND R.json IS NOT NULL AND R.json != ''",
        array(':LI' => $LINK->id)
    );
    
    foreach ($signature_check as $row) {
        if ($row['json']) {
            $json_data = json_decode($row['json'], true);
            if ($json_data && isset($json_data['signature']) && 
                isset($json_data['signature']['signed']) && 
                $json_data['signature']['signed']) {
                $has_signatures = true;
                break;
            }
        }
    }
}

// Set up menu
$menu = false;
if ($USER->instructor) {
    $menu = new \Tsugi\UI\MenuSet();
    $menu->addRight(__('Settings'), '#', false, SettingsForm::attr());
}

// Render view
$OUTPUT->header();
$OUTPUT->bodyStart();
$OUTPUT->topNav($menu);

if ($USER->instructor) {
    $OUTPUT->welcomeUserCourse();
    echo('<br clear="all">');
    
    // Settings form
    SettingsForm::start();
    echo("<h2>Agreement Settings</h2>\n");
    
    // Use the $has_signatures variable already set above
    
    if ($has_signatures) {
        echo('<div class="alert alert-warning">');
        echo('<strong>Warning:</strong> Changing the agreement text will clear all existing signatures. ');
        echo('Students will need to re-sign to receive a grade. Existing grades will be left as is.');
        echo('</div>');
        SettingsForm::checkbox('confirm_clear', 'I understand that changing the agreement will clear all signatures');
    }
    
    SettingsForm::textarea('agreement_text', __('Agreement Text'), $agreement_text);
    SettingsForm::done();
    SettingsForm::end();
    
    echo('<hr>');
    
    // Show current agreement text
    echo('<h2>Current Agreement Text</h2>');
    if (strlen($agreement_text) > 0) {
        echo('<div class="well" style="white-space: pre-wrap;">'.htmlentities($agreement_text).'</div>');
    } else {
        echo('<p class="text-muted">No agreement text has been set yet.</p>');
    }
    
    echo('<hr>');
    
    // Student Data table
    echo('<h2>Student Data</h2>');
    $OUTPUT->flashMessages();
    
    // Manual pagination for custom rendering
    $query_parms = array(':LI' => $LINK->id);
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $per_page = 50; // Students per page
    $offset = ($page - 1) * $per_page;
    
    // Get total count
    $count_sql = "SELECT COUNT(*) as cnt FROM {$p}lti_result AS R WHERE R.link_id = :LI";
    $count_row = $PDOX->rowDie($count_sql, $query_parms);
    $total = $count_row ? $count_row['cnt'] : 0;
    $total_pages = $total > 0 ? ceil($total / $per_page) : 0;
    
    if ($total > 0) {
        // Get paged data with JSON extraction
        $sql_with_extracted = "SELECT R.user_id, U.displayname, U.email, R.json,
            CASE 
                WHEN R.json IS NOT NULL AND R.json != '' AND JSON_EXTRACT(R.json, '$.signature.signed') = true 
                THEN JSON_UNQUOTE(JSON_EXTRACT(R.json, '$.signature.typed_name'))
                ELSE NULL 
            END as typed_name,
            CASE 
                WHEN R.json IS NOT NULL AND R.json != '' AND JSON_EXTRACT(R.json, '$.signature.signed') = true 
                THEN JSON_UNQUOTE(JSON_EXTRACT(R.json, '$.signature.signed_at'))
                ELSE NULL 
            END as signed_at,
            CASE 
                WHEN R.json IS NOT NULL AND R.json != '' AND JSON_EXTRACT(R.json, '$.signature.signed') = true 
                THEN 'Y' 
                ELSE 'N' 
            END as signed_status
        FROM {$p}lti_result AS R
        JOIN {$p}lti_user AS U ON R.user_id = U.user_id
        WHERE R.link_id = :LI
        ORDER BY U.displayname
        LIMIT ".intval($per_page)." OFFSET ".intval($offset);
        
        $rows = $PDOX->allRowsDie($sql_with_extracted, $query_parms);
        
        echo('<table class="table table-striped">');
        echo('<thead><tr>');
        echo('<th>Student Name</th>');
        echo('<th>Typed Name</th>');
        echo('<th>Signed At</th>');
        echo('<th>Signed?</th>');
        echo('<th>Action</th>');
        echo('</tr></thead>');
        echo('<tbody>');
        
        foreach ($rows as $student) {
            echo('<tr>');
            echo('<td>'.htmlentities($student['displayname'] ?? 'Unknown').'</td>');
            
            if ($student['signed_status'] == 'Y') {
                echo('<td>'.htmlentities($student['typed_name'] ?? '-').'</td>');
                if ($student['signed_at']) {
                    try {
                        $dt = new DateTime($student['signed_at']);
                        echo('<td>'.htmlentities($dt->format('Y-m-d H:i:s')).'</td>');
                    } catch (Exception $e) {
                        echo('<td>-</td>');
                    }
                } else {
                    echo('<td>-</td>');
                }
                echo('<td>Y</td>');
                echo('<td><a href="'.addSession('student-detail.php?user_id='.$student['user_id']).'" class="btn btn-sm btn-primary">View Details</a></td>');
            } else {
                echo('<td>-</td>');
                echo('<td>-</td>');
                echo('<td>N</td>');
                echo('<td>-</td>');
            }
            
            echo('</tr>');
        }
        
        echo('</tbody></table>');
        
        // Pagination controls
        if ($total_pages > 1) {
            echo('<nav aria-label="Page navigation">');
            echo('<ul class="pagination">');
            
            // Previous button
            if ($page > 1) {
                $prev_url = addSession('index.php?page='.($page - 1));
                echo('<li class="page-item"><a class="page-link" href="'.$prev_url.'">Previous</a></li>');
            } else {
                echo('<li class="page-item disabled"><span class="page-link">Previous</span></li>');
            }
            
            // Page numbers
            for ($i = 1; $i <= $total_pages; $i++) {
                if ($i == $page) {
                    echo('<li class="page-item active"><span class="page-link">'.$i.'</span></li>');
                } else {
                    $page_url = addSession('index.php?page='.$i);
                    echo('<li class="page-item"><a class="page-link" href="'.$page_url.'">'.$i.'</a></li>');
                }
            }
            
            // Next button
            if ($page < $total_pages) {
                $next_url = addSession('index.php?page='.($page + 1));
                echo('<li class="page-item"><a class="page-link" href="'.$next_url.'">Next</a></li>');
            } else {
                echo('<li class="page-item disabled"><span class="page-link">Next</span></li>');
            }
            
            echo('</ul>');
            echo('</nav>');
            echo('<p class="text-muted">Showing '.($offset + 1).'-'.min($offset + $per_page, $total).' of '.$total.' students</p>');
        }
    } else {
        echo('<p>No students have accessed this tool yet.</p>');
    }
    
} else {
    // Student view
    $OUTPUT->flashMessages();
    
    if (strlen($agreement_text) == 0) {
        echo('<div class="alert alert-info">');
        echo('<p><strong>This agreement is not configured yet.</strong></p>');
        echo('<p>Please contact your instructor if you believe this is an error.</p>');
        echo('</div>');
    } else if ($signature_data && isset($signature_data['signed']) && $signature_data['signed']) {
        // Already signed - show confirmation
        echo('<div class="alert alert-success">');
        echo('<h3>You have signed this agreement</h3>');
        
        $signed_at = isset($signature_data['signed_at']) ? $signature_data['signed_at'] : '';
        if ($signed_at) {
            $dt = new DateTime($signed_at);
            echo('<p><strong>Signed on:</strong> '.htmlentities($dt->format('F j, Y \a\t g:i A')).'</p>');
        }
        
        echo('<p><strong>Signed as:</strong> '.htmlentities($signature_data['typed_name'] ?? '').'</p>');
        echo('</div>');
        
        echo('<hr>');
        echo('<h3>Agreement Text You Signed</h3>');
        echo('<div class="well" style="white-space: pre-wrap;">'.htmlentities($signature_data['agreement_text_snapshot'] ?? '').'</div>');
        
    } else {
        // Show agreement and sign form
        echo('<h2>Agreement</h2>');
        echo('<div class="well" style="white-space: pre-wrap; margin-bottom: 20px;">'.htmlentities($agreement_text).'</div>');
        
        echo('<div style="padding-left: 20px; padding-right: 20px;">');
        echo('<form method="post" class="form-horizontal">');
        if (isset($_SESSION['sesskey'])) {
            echo('<input type="hidden" name="sesskey" value="'.htmlentities($_SESSION['sesskey']).'">');
        }
        
        echo('<div class="form-group">');
        echo('<label for="typed_name">Type your name:</label>');
        echo('<input type="text" class="form-control" id="typed_name" name="typed_name" required placeholder="Type your name">');
        echo('</div>');
        
        echo('<div class="form-group">');
        echo('<div class="checkbox">');
        echo('<label>');
        echo('<input type="checkbox" name="agree" value="1" required> ');
        echo('<strong>I agree</strong>');
        echo('</label>');
        echo('</div>');
        echo('</div>');
        
        echo('<div class="form-group">');
        echo('<button type="submit" name="sign" class="btn btn-primary btn-lg">Sign Agreement</button>');
        echo('</div>');
        
        echo('</form>');
        echo('</div>');
    }
}

$OUTPUT->footer();

