;; create a network connection to the blogserver to save blog posts,
;; edit posts, change catagories, etc.
;; first version: login, publish & thats all
;; requires blog-server and blog-port to be defined

(setq blogbuffer nil)
(setq blogprocess nil)
;(process-status blogprocess)

(defun start-author-connection ()
  "open process and get logged in"
  (interactive)
    (if (or (not blogprocess) (not (equal (process-status blogprocess) 'open)))
	(progn
	  (setq blogbuffer (generate-new-buffer-name "blog-output"))
	  (setq blogprocess
		(open-network-stream "blogger" blogbuffer blog-server blog-port))
	  (if (accept-process-output blogprocess 10 0)
	      (let
		  ((pwd (read-from-minibuffer "Enter Password for Author Server: ")))
		(login-to-author pwd))
	    (error "No output came from blog process")))
      blogprocess))

(defun publish-blog ()
  (interactive)
  (progn
    ; make sure we have a connection.  if not, start it
    (if (not (start-author-connection))
	(error "Could not start connection to author server")
      (let
	  (fname text)
	; get the name of the file for this buffer
	(setq fname (file-name-nondirectory (buffer-file-name)))
	; construct the line to send to the server
	(setq text 
	      (concat "publish " fname "\r\nx"
		      (replace-regexp-in-string 
		       "\n" 
		       "\r\nx" 
		       (buffer-substring (point-min) (point-max))
		       t
		       t)
		      "\r\n \r\n"))
	(process-send-string blogprocess text)))))


    
  
(defun login-to-author (pwd)
  "send login command to server"
  (interactive "Mpasswd: ")
  (if (equal (process-status blogprocess) 'open)
      (save-excursion
	(set-buffer blogbuffer)
	(goto-char (point-max))
	(re-search-backward "^Hello ")
	(re-search-forward "Hello ")
	(if (looking-at "[A-Z]+")
	    (let
		(nonce hash start)
	      (setq nonce (match-string 0))
	      (setq hash (md5 (concat nonce pwd) nil nil 'utf-8))
	      (setq start (point-max))
	      (process-send-string blogprocess (concat "login seth " hash "\r\n"))
	      (process-send-string blogprocess " \r\n")
	      (if (accept-process-output blogprocess 10 0)
		  (progn
		    (goto-char start)
		    (if (search-forward "is logged in." nil t)
			blogprocess
		      (error "bad response from login")))
		(error "No response to login")))
	  (error "Could not find Hello nonce")))
    (error "no open process to server")))
    
(define-derived-mode blog-mode text-mode "Blog"
  "Major mode for editting blog posts"
  (add-hook 'after-save-hook 'publish-blog nil 'make-it-local))

(defun new-blog-entry ()
  "open a new blog entry"
  (interactive)
  (let (
	(year (substring (current-time-string) 20 24))
	(month (substring (current-time-string) 4 7))
	(day (substring (current-time-string) 8 10))
	(extra "")
	(base)
       )
    (setq base (replace-regexp-in-string 
		" " 
		"" 
		(concat "/home/seth/blog/entries/" year "-" month "-" day)))
    (while (file-exists-p (concat base extra ".txt"))
      (if (equal extra "")
	  (setq extra ".0"))
      (setq extra (concat "." (number-to-string (+ 1 (string-to-number (substring extra 1)))))))
    ; eliminate any spaces we might have
    (find-file (concat base extra ".txt"))
    (goto-char (point-max))
    (if (not (equal (point) (point-min)))
	(insert "\n--------\n"))
    (insert (concat "Date: " (current-time-string) "\n"))
    (insert (concat "Title: \nCategories: \n\n"))
    (backward-char 2)))
(global-set-key "\C-Ce" 'new-blog-entry)

(add-to-list 'auto-mode-alist '("/blog/entries/" . blog-mode))

